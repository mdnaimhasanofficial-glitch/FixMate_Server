# FixMate Server

Express (ES modules) + MongoDB API for FixMate — a home repair service marketplace.

## Tech stack

- **Express 5** (ES modules, plain JavaScript)
- **MongoDB** native driver (`getCollections()` from `src/config/db.js`)
- **jsonwebtoken** — role based auth (`customer`, `technician`, `admin`)
- **Stripe** (test mode) — checkout, verify and webhook
- **cors + dotenv**

## Setup

```bash
npm install
cp .env.example .env   # then fill in your values
npm run dev            # nodemon, http://localhost:5000
```

### Environment variables (.env)

| Key | Purpose |
| --- | --- |
| `PORT` | Server port (default 5000) |
| `MONGODB_URI` | MongoDB connection string |
| `DB_NAME` | Database name |
| `JWT_SECRET` | Secret used to sign/verify tokens |
| `STRIPE_SECRET_KEY` | Stripe test secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PRO_PRICE_ID` | recurring Stripe price for the Pro plan (`price_...`) |
| `CLIENT_URL` | Frontend URL (allowed by CORS) |

## Seed data

```bash
npm run seed
```

Safe to run many times. It promotes `admin@fixmate.com` to admin, creates 2 technician
accounts and 1 demo customer, then inserts 12 approved services, 8 bookings (every
status) and 1 payment. Seeded docs are marked with `seeded: true`.

## API routes

| Method | Route | Who | What |
| --- | --- | --- | --- |
| GET | `/` | public | health check |
| GET | `/api/services` | public | list approved services (search, category, serviceMode, sort, page) |
| GET | `/api/services/:id` | public | service details + technician name/image/area/bio |
| GET | `/api/services/my` | technician | own services |
| POST | `/api/services` | technician | add service (starts as `pending`) |
| PATCH | `/api/services/:id` | technician | edit own service (goes back to `pending`) |
| PATCH | `/api/services/:id/availability` | technician | on/off availability |
| DELETE | `/api/services/:id` | technician | delete own service |
| POST | `/api/bookings` | customer | create repair request (duplicate active → 409; free plan at 5 bookings → 403 `FREE_LIMIT_REACHED`) |
| GET | `/api/bookings/my` | customer | own bookings |
| PATCH | `/api/bookings/:id/cancel` | customer | cancel (only when `requested`) |
| GET | `/api/bookings/technician` | technician | own jobs (`?status=` filter) |
| PATCH | `/api/bookings/:id/status` | technician | status pipeline via `canChange()` |
| POST | `/api/payments/create-checkout-session` | customer | start Stripe checkout |
| GET | `/api/payments/verify?session_id=` | customer | verify paid + save payment |
| GET | `/api/payments/my` | customer | payment history |
| POST | `/api/payments/webhook` | Stripe | raw body + signature (registered **before** `express.json()`) |
| POST | `/api/subscription/create-checkout-session` | customer | start Stripe Checkout for the Pro plan |
| GET | `/api/subscription/status` | customer | `{ plan, usedCount, remaining, limit }` (`remaining` = null for Pro) |
| GET | `/api/subscription/verify?session_id=` | customer | verify paid session + activate Pro instantly (webhook fallback) |
| GET | `/api/subscription/price` | public | live Pro price from Stripe (used by the pricing page) |
| POST | `/api/stripe/webhook` | Stripe | raw body + signature; sets `plan: "pro"` on Pro checkout (registered **before** `express.json()`) |
| GET/PATCH | `/api/users/profile` | any logged in | update name, phone, area, bio, image |
| GET | `/api/stats` | any logged in | role based stats + chart grouped by status |
| GET | `/api/admin/users` | admin | all users |
| PATCH | `/api/admin/users/:id/role` | admin | change role (not your own) |
| GET | `/api/admin/services` | admin | all services (`?status=`) |
| PATCH | `/api/admin/services/:id/approval` | admin | approve / reject |
| GET | `/api/admin/bookings` | admin | all bookings (`?status=`) |
| GET | `/api/admin/payments` | admin | payments + totalRevenue |

> **Note:** every route file is mounted in `index.js`
> (`app.use('/api/services', servicesRoutes)` and so on), so all of the routes below work.

### Status pipeline

```
requested ──accepted──▶ accepted ──▶ in-progress ──▶ completed
    │                                         (final)
    ├──rejected──▶ rejected (final)
    └──cancelled by customer (final)
```

Rules live in `src/utils/statusRules.js` (`canChange(from, to, role)`).

## Project structure

```
index.js                 app + middleware order + error handlers
src/config/db.js         MongoDB connection + getCollections()
src/middlewares/auth.js  verifyToken / verifyCustomer / verifyTechnician / verifyAdmin
src/routes/*.routes.js   one file per resource
src/utils/               statusRules.js, savePayment.js, subscription.js
src/seed.js              demo data (npm run seed)
```

## Deploy (Vercel)

`vercel.json` builds `index.js` with `@vercel/node` and rewrites every path to it.
The app exports `default app` and only calls `app.listen()` when `VERCEL` is not set,
so the same code runs locally and on Vercel.

### Vercel environment variables

`vercel` CLI দিয়ে deploy করলে বা Dashboard → Project → Settings → Environment Variables থেকে
সেট করতে হবে (`.env` ফাইল Vercel-এ যায় না):

| Key | Value |
| --- | --- |
| `MONGODB_URI` | same MongoDB connection string as local |
| `DB_NAME` | e.g. `fixmate` |
| `JWT_SECRET` | **exactly the same** value as the client project's `JWT_SECRET` |
| `STRIPE_SECRET_KEY` | Stripe test secret key |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` signing secret of the production webhook |
| `STRIPE_PRO_PRICE_ID` | the recurring Pro plan price (`price_...`) |
| `CLIENT_URL` | the frontend URL, e.g. `https://your-client.vercel.app` |

> `JWT_SECRET` দুই project-এ আলাদা হলে সব API request 401 দেবে — একই value রাখতে হবে।

### Stripe webhook setup (production)

1. Deploy this server first, note the URL: `https://your-server.vercel.app`
2. Stripe Dashboard → **Developers → Webhooks → Add endpoint**
   - URL: `https://your-server.vercel.app/api/stripe/webhook`
   - Events: `checkout.session.completed`
3. Copy the **Signing secret** (`whsec_...`) into the Vercel env var
   `STRIPE_WEBHOOK_SECRET`
4. One endpoint handles everything: booking payments **and** Pro plan upgrades both
   arrive at `/api/stripe/webhook` (the older `/api/payments/webhook` still works too).

### Test the webhook locally (`stripe listen --forward-to`)

```bash
stripe listen --forward-to localhost:5000/api/stripe/webhook
```

1. Stripe CLI prints its **own** signing secret (`whsec_...`) — copy it into `.env` as
   `STRIPE_WEBHOOK_SECRET` (it is different from the Dashboard secret) and restart the
   server.
2. Trigger a test event: `stripe trigger checkout.session.completed`
   — the CLI log shows the event and the server answers `{"received":true}`.
3. A wrong signature is rejected with HTTP 400 (`Webhook Error: ...`).
4. Real end-to-end test: click **Upgrade to Pro** on `/pricing` and pay with the test
   card `4242 4242 4242 4242`, expiry any future date, CVC any 3 digits — the webhook
   sets `plan: "pro"` and `/payment/success` shows *Welcome to Pro!*.
