# FixMate Server — Rules for the AI agent

## Project

Express (ES modules, JavaScript), MongoDB native driver, jsonwebtoken, Stripe (test mode).
Collections: user (BetterAuth), services, bookings, payments. Use getCollections() from
src/config/db.js.

## Coding style (I am a beginner, keep it simple and readable)- Simple, beginner friendly code. No classes, no unnecessary abstractions.- Routes live in src/routes/\*.routes.js, middlewares in src/middlewares, helpers in src/utils.- Short plain-English comment above every route saying what it does.- Always validate input and return clear messages: res.status(400).send({ message: '...' }).- Always check ObjectId.isValid(id) before new ObjectId(id).- Never trust data from the client for: email, name, role, price, amount. Take them from req.user or

the database.- A user must only reach their own data: filter by req.user.email, never by an email from the URL or
body.- 401 = no/invalid token, 403 = wrong role, 404 = not found, 400 = bad request or invalid status
change.- Secrets only from process.env. Never hardcode.

## Do NOT touch (unless I ask): src/middlewares/auth.js, src/utils/statusRules.js,

src/utils/savePayment.js

## When you finish a task: list every file you created or changed. Do not run git commit.
