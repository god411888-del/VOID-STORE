import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {fileURLToPath} from 'url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const DATA=path.join(__dirname,'data','store.json');
const app=express();
app.use(helmet({contentSecurityPolicy:false}));
app.use(express.json({limit:'100kb'}));
app.use(express.static(path.join(__dirname,'public')));
const payLimit=rateLimit({windowMs:60_000,max:30,standardHeaders:true,legacyHeaders:false});
const adminSessions=new Map();
function db(){return JSON.parse(fs.readFileSync(DATA,'utf8'))}
function save(x){fs.writeFileSync(DATA,JSON.stringify(x,null,2))}
function money(n){return Math.round(Number(n)*100)/100}
function auth(req,res,next){const token=req.headers.authorization?.replace('Bearer ',''); if(!token||!adminSessions.has(token)) return res.status(401).json({error:'Unauthorized'}); next()}
app.get('/api/products',(req,res)=>{const d=db();res.json(d.products.map(p=>({...p,stockCount:p.stock.length,stock:undefined})))})
app.post('/api/orders',payLimit,(req,res)=>{
  const {name,email,phone,items}=req.body; if(!name||!email||!phone||!Array.isArray(items)||!items.length)return res.status(400).json({error:'Complete customer details and cart required.'});
  const d=db(); let total=0; const clean=[];
  for(const i of items){const p=d.products.find(x=>x.id===i.id);const qty=Math.max(1,Math.min(10,Number(i.qty)||1));if(!p)return res.status(400).json({error:'Product not found'});if(p.stock.length<qty)return res.status(409).json({error:`${p.name} is out of stock`});total+=p.price*qty;clean.push({id:p.id,name:p.name,qty,price:p.price})}
  const order={id:'VOID-'+Date.now(),name,email,phone,total:money(total),items:clean,status:'pending',createdAt:new Date().toISOString()};d.orders.push(order);save(d);
  res.json({orderId:order.id,total:order.total,payment:'backend-required',message:'Order created. Add Paystack secret key to enable payment initialization.'});
});
app.post('/api/paystack/initialize',payLimit,async(req,res)=>{
  if(!process.env.PAYSTACK_SECRET_KEY)return res.status(503).json({error:'PAYSTACK_SECRET_KEY is not configured.'});
  const {orderId,email}=req.body;const d=db();const o=d.orders.find(x=>x.id===orderId);if(!o||o.email!==email)return res.status(404).json({error:'Order not found'});
  const r=await fetch('https://api.paystack.co/transaction/initialize',{method:'POST',headers:{Authorization:`Bearer ${process.env.PAYSTACK_SECRET_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({email,amount:Math.round(o.total*100),reference:o.id,callback_url:`${process.env.PUBLIC_URL}/?payment=callback`})});
  const j=await r.json();if(!r.ok||!j.status)return res.status(502).json({error:j.message||'Payment initialization failed'});o.paymentReference=j.data.reference;save(d);res.json({authorization_url:j.data.authorization_url,reference:j.data.reference});
});
app.get('/api/paystack/verify/:reference',async(req,res)=>{
  if(!process.env.PAYSTACK_SECRET_KEY)return res.status(503).json({error:'Payment verification is not configured.'});
  const r=await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(req.params.reference)}`,{headers:{Authorization:`Bearer ${process.env.PAYSTACK_SECRET_KEY}`}});const j=await r.json();if(!r.ok||!j.status)return res.status(502).json({error:j.message||'Verification failed'});
  const d=db();const o=d.orders.find(x=>x.paymentReference===req.params.reference||x.id===req.params.reference);if(!o)return res.status(404).json({error:'Order not found'});
  if(j.data.status==='success'&&Math.round(j.data.amount)===Math.round(o.total*100)){if(o.status!=='paid'){o.status='paid';o.paidAt=new Date().toISOString();for(const item of o.items){const p=d.products.find(x=>x.id===item.id);item.delivery=[];for(let n=0;n<item.qty;n++){if(p?.stock?.length)item.delivery.push(p.stock.shift())}}save(d)}}res.json({status:o.status,order:o});
});
app.post('/api/admin/login',payLimit,(req,res)=>{const {username,password}=req.body;if(username!==process.env.ADMIN_USER||password!==process.env.ADMIN_PASSWORD)return res.status(401).json({error:'Invalid credentials'});const token=crypto.randomBytes(32).toString('hex');adminSessions.set(token,Date.now()+8*60*60*1000);res.json({token})});
app.get('/api/admin/orders',auth,(req,res)=>{const d=db();res.json(d.orders)})
app.post('/api/admin/products',auth,(req,res)=>{const {name,cat,price,stock}=req.body;if(!name||!cat||!Number(price)||!Array.isArray(stock))return res.status(400).json({error:'Invalid product'});const d=db();const p={id:'p'+crypto.randomBytes(6).toString('hex'),name,cat,price:Number(price),stock:stock.filter(Boolean)};d.products.push(p);save(d);res.json(p)})
app.get('/api/admin/stats',auth,(req,res)=>{const d=db();res.json({products:d.products.length,orders:d.orders.length,sales:d.orders.filter(o=>o.status==='paid').reduce((a,o)=>a+o.total,0),pending:d.orders.filter(o=>o.status!=='paid').length})})
app.get('/health',(req,res)=>res.json({ok:true,service:'VOID STORE V5'}));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
const port=Number(process.env.PORT)||3000;app.listen(port,()=>console.log(`VOID STORE V5 running on ${port}`));
