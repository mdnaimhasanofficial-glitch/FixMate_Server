import { Router } from 'express';
import Stripe from 'stripe';
import { getCollections } from '../config/db.js';
import { verifyToken } from '../middlewares/auth.js';
import { getPlanStatus, FREE_BOOKING_LIMIT } from '../utils/subscription.js';
import { savePaidSession } from '../utils/savePayment.js';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ১) LOGGED IN USER: Stripe Checkout শুরু করা (Pro plan)
router.post('/create-checkout-session', verifyToken, async (req, res) => {
  const priceId = process.env.STRIPE_PRO_PRICE_ID;
  if (!priceId) {
    return res.status(500).send({ message: 'STRIPE_PRO_PRICE_ID is not set on the server' });
  }
  // Payment শেষে যে page থেকে এসেছিল সেটায় ফিরে যাবে।
  // শুধু internal path চলবে (// বা \ থাকলে dashboard-এ পাঠাবে) — open redirect ঠেকানো হয়।
  const requestedReturn = typeof req.body?.returnTo === 'string' ? req.body.returnTo : '';
  const returnTo =
    requestedReturn.startsWith('/') &&
    !requestedReturn.startsWith('//') &&
    !requestedReturn.includes('\\')
      ? requestedReturn
      : '/dashboard/customer';
  const planStatus = await getPlanStatus(req.user.email);
  // ইতিমধ্যে Pro থাকলে আবার কেনার দরকার নেই
  if (planStatus.plan === 'pro') {
    return res.status(400).send({ message: 'You are already on the Pro plan' });
  }
  try {
    const sessionParams = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { type: 'subscription', email: req.user.email },
      success_url: `${process.env.CLIENT_URL}/payment/success?source=subscription&returnTo=${encodeURIComponent(returnTo)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/payment/cancel?source=subscription&returnTo=${encodeURIComponent(returnTo)}`,
    };
    // Stripe customer আগে থেকে থাকলে সেটাই ব্যবহার করো, নাহলে email দিয়ে নতুন বানাবে
    if (planStatus.stripeCustomerId) sessionParams.customer = planStatus.stripeCustomerId;
    else sessionParams.customer_email = req.user.email;
    const session = await stripe.checkout.sessions.create(sessionParams);
    res.send({ url: session.url });
  } catch (error) {
    res.status(500).send({ message: `Stripe error: ${error.message}` });
  }
});

// ২) LOGGED IN USER: নিজের plan status (dashboard progress bar এটা পড়ে)
router.get('/status', verifyToken, async (req, res) => {
  const planStatus = await getPlanStatus(req.user.email);
  res.send({
    plan: planStatus.plan,
    usedCount: planStatus.usedCount,
    remaining: planStatus.remaining, // null = unlimited (Pro)
    limit: planStatus.limit || FREE_BOOKING_LIMIT,
  });
});

// ৩) LOGGED IN USER: Stripe session verify — payment হয়ে গেলে সাথে সাথে Pro বানায়।
// Webhook না এলেও কাজ করে, তাই local test-এ redirect কাজ করবে।
router.get('/verify', verifyToken, async (req, res) => {
  const sessionId = req.query.session_id;
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).send({ message: 'Missing session_id' });
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items.data.price'],
    });
    // শুধু নিজের Pro checkout session গ্রহণযোগ্য
    if (session.mode !== 'subscription' || session.metadata?.type !== 'subscription') {
      return res.status(400).send({ message: 'This is not a Pro plan checkout session' });
    }
    if (session.metadata?.email !== req.user.email) {
      return res.status(403).send({ message: 'This session belongs to another user' });
    }
    if (session.payment_status !== 'paid') {
      return res.status(400).send({ message: 'Payment not completed yet' });
    }
    // একই কাজ webhook-ও করে — দুইবার হলেও সমস্যা নেই (idempotent)
    const proExpiresAt = await activatePro(session);
    const planStatus = await getPlanStatus(req.user.email);
    res.send({
      plan: planStatus.plan,
      usedCount: planStatus.usedCount,
      remaining: planStatus.remaining,
      limit: planStatus.limit,
      amount: session.amount_total, // cents
      currency: session.currency,
      interval: session.line_items?.data?.[0]?.price?.recurring?.interval || 'month',
      proExpiresAt,
    });
  } catch (error) {
    res.status(500).send({ message: `Stripe error: ${error.message}` });
  }
});

// ৪) PUBLIC: Pro plan-এর live price (pricing page দেখায়, Stripe থেকে পড়ে)
router.get('/price', async (req, res) => {
  const priceId = process.env.STRIPE_PRO_PRICE_ID;
  if (!priceId) return res.send({ amount: null, currency: 'usd', interval: 'month' });
  try {
    const price = await stripe.prices.retrieve(priceId);
    res.send({
      amount: price.unit_amount, // cents
      currency: price.currency,
      interval: price.recurring?.interval || 'month',
    });
  } catch (error) {
    console.error('Could not read the Pro price:', error.message);
    res.send({ amount: null, currency: 'usd', interval: 'month' });
  }
});

export default router;

// ৩) Webhook: raw body আসে index.js থেকে (express.json এর আগে বসানো)
// Stripe signature verify করে subscription টাকা পড়লে user-কে Pro বানায়
export async function stripeSubscriptionWebhook(req, res) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || secret === 'whsec_xxx') {
    return res.status(500).send({ message: 'STRIPE_WEBHOOK_SECRET is not set' });
  }
  // Signature verify করতে হুবহু raw bytes লাগে (local: Buffer, Vercel: string/rawBody হতে পারে)
  let payload;
  if (Buffer.isBuffer(req.body)) {
    payload = req.body;
  } else if (req.rawBody) {
    payload = Buffer.from(req.rawBody);
  } else if (typeof req.body === 'string') {
    payload = Buffer.from(req.body, 'utf8');
  } else {
    payload = Buffer.from(JSON.stringify(req.body ?? {}));
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(payload, req.headers['stripe-signature'], secret);
  } catch (error) {
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    // Pro plan checkout শেষ হলে user-কে Pro করো
    if (session.mode === 'subscription' || session.metadata?.type === 'subscription') {
      await activatePro(session);
    } else if (session.payment_status === 'paid' && session.metadata?.bookingId) {
      // একই endpoint দিয়ে booking payment-ও save হতে পারে (একটাই Stripe endpoint রাখলে)
      await savePaidSession(session);
    }
  }
  res.send({ received: true });
}

// Stripe session থেকে user-কে Pro বানানো (webhook থেকে ডাকা হয়)
async function activatePro(session) {
  const email = session.metadata?.email || session.customer_details?.email;
  if (!email) {
    console.error('Subscription webhook: no email on the session');
    return;
  }
  // Subscription কবে শেষ হবে সেটা Stripe থেকে পড়ে proExpiresAt-এ রাখো
  let proExpiresAt = null;
  if (session.subscription) {
    try {
      const subscription = await stripe.subscriptions.retrieve(session.subscription);
      // নতুন Stripe API-তে current_period_end subscription item-এ থাকে — দুই জায়গাই দেখো
      const periodEnd =
        subscription.current_period_end || subscription.items?.data?.[0]?.current_period_end;
      // শুধু আসল timestamp হলেই date বানাও (না পেলে null = কখনো expire হবে না)
      if (periodEnd) proExpiresAt = new Date(periodEnd * 1000);
    } catch (error) {
      console.error('Could not read the subscription:', error.message);
    }
  }
  const { users } = await getCollections();
  await users.updateOne(
    { email },
    {
      $set: {
        plan: 'pro',
        proActivatedAt: new Date(),
        proExpiresAt,
        stripeCustomerId:
          typeof session.customer === 'string' ? session.customer : session.customer?.id || null,
      },
    }
  );
  // Success page কবে পর্যন্ত Pro থাকবে সেটা দেখাতে চায়
  return proExpiresAt;
}
