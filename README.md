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
| POST | `/api/bookings` | customer | create repair request (duplicate active request → 409) |
| GET | `/api/bookings/my` | customer | own bookings |
| PATCH | `/api/bookings/:id/cancel` | customer | cancel (only when `requested`) |
| GET | `/api/bookings/technician` | technician | own jobs (`?status=` filter) |
| PATCH | `/api/bookings/:id/status` | technician | status pipeline via `canChange()` |
| POST | `/api/payments/create-checkout-session` | customer | start Stripe checkout |
| GET | `/api/payments/verify?session_id=` | customer | verify paid + save payment |
| GET | `/api/payments/my` | customer | payment history |
| POST | `/api/payments/webhook` | Stripe | raw body + signature (registered **before** `express.json()`) |
| GET/PATCH | `/api/users/profile` | any logged in | update name, phone, area, bio, image |
| GET | `/api/stats` | any logged in | role based stats + chart grouped by status |
| GET | `/api/admin/users` | admin | all users |
| PATCH | `/api/admin/users/:id/role` | admin | change role (not your own) |
| GET | `/api/admin/services` | admin | all services (`?status=`) |
| PATCH | `/api/admin/services/:id/approval` | admin | approve / reject |
| GET | `/api/admin/bookings` | admin | all bookings (`?status=`) |
| GET | `/api/admin/payments` | admin | payments + totalRevenue |

> **Note:** the route files are ready but still need to be mounted in `index.js`
> (`app.use('/api/services', servicesRoutes)` and so on). Until then they return 404.

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
src/utils/               statusRules.js, savePayment.js
src/seed.js              demo data (npm run seed)
```

## Deploy (Vercel)

`vercel.json` builds `index.js` with `@vercel/node` and rewrites every path to it.
The app exports `default app` and only calls `app.listen()` when `VERCEL` is not set,
so the same code runs locally and on Vercel.

Stripe webhook URL for production: `https://<your-domain>/api/payments/webhook`
