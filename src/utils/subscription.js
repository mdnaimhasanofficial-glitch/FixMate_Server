import { getCollections } from '../config/db.js';

// How many services a free customer can book
export const FREE_BOOKING_LIMIT = 5;

// Read one customer's plan from the database and check the free limit.
// A Pro plan that has expired (proExpiresAt in the past) counts as Free again.
export async function getPlanStatus(email) {
  const { users, bookings } = await getCollections();
  const user = await users.findOne({ email });
  const usedCount = await bookings.countDocuments({ customerEmail: email });

  // Pro plan শুধু customer রোলের জন্য — technician বা admin হলে সবসময় free
  const role = user?.role || 'customer';
  let plan = user?.plan === 'pro' && role === 'customer' ? 'pro' : 'free';
  // Pro কবে শেষ হয়েছে দেখো। ভুল তারিখ (epoch 0 / 1970) হলে expire ধরা হবে না।
  const expiresAt = user?.proExpiresAt ? new Date(user.proExpiresAt).getTime() : 0;
  if (plan === 'pro' && expiresAt > 0 && expiresAt < Date.now()) {
    plan = 'free'; // subscription period is over
  }
  const isPro = plan === 'pro';

  return {
    plan,
    usedCount,
    limit: FREE_BOOKING_LIMIT,
    // Pro is unlimited, so remaining is null (free: how many bookings are left)
    remaining: isPro ? null : Math.max(FREE_BOOKING_LIMIT - usedCount, 0),
    canBook: isPro || usedCount < FREE_BOOKING_LIMIT,
    stripeCustomerId: user?.stripeCustomerId || null,
  };
}
