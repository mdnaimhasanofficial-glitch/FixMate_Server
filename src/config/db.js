import { MongoClient } from 'mongodb';

let db;

// Connect one time and reuse the connection
export async function connectDB() {
  if (db) return db;
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db(process.env.DB_NAME);
  // unique index so the same Stripe session is never saved twice
  await db.collection('payments').createIndex({ stripeSessionId: 1 }, { unique: true });
  return db;
}

// All collections in one helper
export async function getCollections() {
  const database = await connectDB();
  return {
    users: database.collection('user'), // BetterAuth user collection
    services: database.collection('services'),
    bookings: database.collection('bookings'),
    payments: database.collection('payments'),
  };
}
