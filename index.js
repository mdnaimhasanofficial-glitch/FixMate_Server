import 'dotenv/config'; // env variables load first
import express from 'express';
import cors from 'cors';
import paymentsRoutes, { stripeWebhook } from './src/routes/payments.routes.js';
import servicesRoutes from './src/routes/services.routes.js';
import bookingsRoutes from './src/routes/bookings.routes.js';
import usersRoutes from './src/routes/users.routes.js';
import adminRoutes from './src/routes/admin.routes.js';
import statsRoutes from './src/routes/stats.routes.js';

const app = express();

// CORS: allow only the client app and local dev server
app.use(cors({ origin: [process.env.CLIENT_URL, 'http://localhost:3000'] }));

// Stripe webhook needs the raw body, so it is registered BEFORE express.json()
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

// JSON parsing for every other route
app.use(express.json());

// Health check route
app.get('/', (req, res) => res.send('FixMate server is running'));

// Every API route the client calls
app.use('/api/services', servicesRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/stats', statsRoutes);

// 404 handler: no route matched
app.use((req, res) => res.status(404).send({ message: 'Route not found' }));

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send({ message: 'Server error' });
});

const PORT = process.env.PORT || 5000;
if (!process.env.VERCEL) app.listen(PORT, () => console.log(`Server running on ${PORT}`));

export default app; // Vercel uses this
