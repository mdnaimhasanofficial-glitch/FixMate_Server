import { ObjectId } from 'mongodb';
import { getCollections } from '../config/db.js';
export async function savePaidSession(session) {
     const { bookings, payments } = await getCollections();
  const booking = await bookings.findOne({ _id: new ObjectId(session.metadata.bookingId) });
  if (!booking) return null;
  // upsert + $setOnInsert = আেগ থাকেল নতুন িকছু বানােব না (একবারই save)
  await payments.updateOne(
    { stripeSessionId: session.id },
    {
      $setOnInsert: {
        bookingId: String(booking._id),
        serviceTitle: booking.serviceTitle,
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        technicianName: booking.technicianName,
        technicianEmail: booking.technicianEmail,
        amount: session.amount_total / 100,
        currency: 'usd',
        transactionId: session.payment_intent,
        stripeSessionId: session.id,
        paymentStatus: 'paid',
        paidAt: new Date(),
      },
    },
    { upsert: true }
  );
  await bookings.updateOne({ _id: booking._id }, { $set: { paymentStatus: 'paid' } });
  return payments.findOne({ stripeSessionId: session.id });
}