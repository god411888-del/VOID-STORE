# VOID STORE V5

A deploy-ready Node/Express foundation for the VOID digital marketplace.

## Included
- Responsive VOID storefront
- Server-side product and order storage
- Admin login with session token
- Admin product creation and stock management
- Order dashboard and paid-sales stats
- Paystack initialization + server-side verification endpoints
- Digital stock is only removed after a verified successful payment
- Helmet security headers and rate limiting

## Run locally
1. Install Node.js 18+.
2. Copy `.env.example` to `.env` and set a strong `ADMIN_PASSWORD`.
3. Add your Paystack secret key to `PAYSTACK_SECRET_KEY` when ready.
4. Run `npm install` then `npm start`.
5. Open `http://localhost:3000`.

## Important
Do not commit `.env` or expose the Paystack secret key in browser JavaScript. For production, move persistent data to a managed database and use HTTPS. The included JSON database is intended as a simple starter and should not be used as the final production database for a high-volume store.
