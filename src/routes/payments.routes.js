import { Router } from 'express';
import Stripe from 'stripe';
import { ObjectId } from 'mongodb';
import { getCollections } from '../config/db.js';
import { verifyToken, verifyCustomer } from '../middlewares/auth.js';
import { savePaidSession } from '../utils/savePayment.js';
const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
// ১) Checkout শুর
router.post('/create-checkout-session', verifyToken, verifyCustomer, async (req, res) => {
  const { bookingId } = req.body;
  if (!ObjectId.isValid(bookingId)) return res.status(400).send({ message: 'Invalid booking' });
  const { bookings } = await getCollections();
  // শুধু িনেজর booking
  const booking = await bookings.findOne({ _id: new ObjectId(bookingId), customerEmail: 
req.user.email });
  if (!booking) return res.status(404).send({ message: 'Booking not found' });
  // Payment Gate: শুধু completed + unpaid
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
          unit_amount: Math.round(booking.finalAmount * 100), // dollar থেক cent
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
// ২) Success page এটা call কের। Stripe-এ সিতই paid িক না যাচাই কের save
router.get('/verify', verifyToken, verifyCustomer, async (req, res) => {
const session = await stripe.checkout.sessions.retrieve(req.query.session_id);
if (session.payment_status !== 'paid') return res.status(400).send({ message: 'Payment not completed' });
if (session.metadata.customerEmail !== req.user.email) return res.status(403).send({ message: 
'Forbidden' });
const payment = await savePaidSession(session);
res.send(payment);
});
// ৩) Customer-এর payment history
router.get('/my', verifyToken, verifyCustomer, async (req, res) => {
const { payments } = await getCollections();
res.send(await payments.find({ customerEmail: req.user.email }).sort({ paidAt: -1 }).toArray());
});
export default router;
// ৪) Webhook (Challenge 4)। index.js-এ raw body িদেয় বসােনা আেছ
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
if (event.type === 'checkout.session.completed' && event.data.object.payment_status === 'paid') {
await savePaidSession(event.data.object);
}
res.send({ received: true });
}