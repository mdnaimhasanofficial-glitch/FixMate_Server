import { Router } from 'express';
import Stripe from 'stripe';
import { ObjectId } from 'mongodb';
import { getCollections } from '../config/db.js';
import { verifyToken, verifyCustomer } from '../middlewares/auth.js';
import { savePaidSession } from '../utils/savePayment.js';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ১) CUSTOMER: Stripe checkout শুরু করা
router.post('/create-checkout-session', verifyToken, verifyCustomer, async (req, res) => {
  const { bookingId } = req.body;
  if (!ObjectId.isValid(bookingId)) return res.status(400).send({ message: 'Invalid booking' });
  const { bookings } = await getCollections();
  // Booking ডাটাবেস থেকে আনো, client থেকে নয়; শুধু নিজের booking
  const booking = await bookings.findOne({
    _id: new ObjectId(bookingId),
    customerEmail: req.user.email,
  });
  if (!booking) return res.status(404).send({ message: 'Booking not found' });
  // শুধু completed + unpaid booking পেমেন্ট করা যায়
  if (booking.status !== 'completed' || booking.paymentStatus !== 'unpaid') {
    return res.status(400).send({ message: 'This booking cannot be paid' });
  }
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: req.user.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(booking.finalAmount * 100), // dollar -> cent
          product_data: { name: booking.serviceTitle },
        },
      },
    ],
    metadata: { bookingId: String(booking._id), customerEmail: req.user.email },
    success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.CLIENT_URL}/payment/cancel`,
  });
  res.send({ url: session.url });
});

// ২) CUSTOMER: success page এটা call করে। Stripe-এ সত্যি paid কিনা যাচাই করে save করে
router.get('/verify', verifyToken, verifyCustomer, async (req, res) => {
  const session = await stripe.checkout.sessions.retrieve(req.query.session_id);
  if (session.payment_status !== 'paid') {
    return res.status(400).send({ message: 'Payment not completed' });
  }
  // Session কার জন্য ছিল, ঠিক সেই user যাচাই করছে কিনা
  if (session.metadata.customerEmail !== req.user.email) {
    return res.status(403).send({ message: 'Forbidden' });
  }
  const payment = await savePaidSession(session);
  res.send(payment);
});

// ৩) CUSTOMER: নিজের payment history
router.get('/my', verifyToken, verifyCustomer, async (req, res) => {
  const { payments } = await getCollections();
  const list = await payments
    .find({ customerEmail: req.user.email })
    .sort({ paidAt: -1 })
    .toArray();
  res.send(list);
});

export default router;

// ৪) Webhook: Stripe নিজে থেকে পাঠায়। index.js-এ express.raw দিয়ে বসানো আছে,
// তাই এখানে raw body আর signature verify করা যায়
export async function stripeWebhook(req, res) {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body, // raw body
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }
  // শুধু paid checkout শেষ হলে payment save হবে (দুইবার হবে না, upsert আছে)
  if (event.type === 'checkout.session.completed' && event.data.object.payment_status === 'paid') {
    await savePaidSession(event.data.object);
  }
  res.send({ received: true });
}
