import 'dotenv/config';
import { getCollections } from './config/db.js';

// Demo accounts used by the seed (safe to run many times)
const adminEmail = 'admin@fixmate.com';
const technicians = [
  {
    email: 'technician1@fixmate.com',
    name: 'Rahim Uddin',
    area: 'Dhanmondi, Dhaka',
    image: 'https://picsum.photos/seed/technician1/200/200',
    bio: 'Samsung and iPhone repair specialist, 8 years experience.',
  },
  {
    email: 'technician2@fixmate.com',
    name: 'Karim Hossain',
    area: 'Uttara, Dhaka',
    image: 'https://picsum.photos/seed/technician2/200/200',
    bio: 'Home appliance and electrical expert, 10 years experience.',
  },
];
const customer = {
  email: 'customer@fixmate.com',
  name: 'Sumon Mia',
  phone: '01711111111',
  address: 'House 12, Road 5, Dhanmondi, Dhaka',
};

// 12 approved services across 7 categories, spread over the 2 technicians
const services = [
  { title: 'Smartphone Screen Replacement', category: 'Smartphone', basePrice: 89, estimatedDuration: '45 min', serviceMode: 'On-site', technician: 0,
    description: 'Original quality OLED and LCD screens for iPhone, Samsung and Xiaomi with 30 days warranty.' },
  { title: 'Smartphone Battery Replacement', category: 'Smartphone', basePrice: 49, estimatedDuration: '30 min', serviceMode: 'On-site', technician: 1,
    description: 'Genuine battery replacement with health check and old battery disposal.' },
  { title: 'Laptop SSD Upgrade & OS Install', category: 'Laptop & PC', basePrice: 120, estimatedDuration: '90 min', serviceMode: 'In-store', technician: 0,
    description: 'Upgrade your laptop to a fast SSD, fresh OS install and data migration included.' },
  { title: 'Desktop PC Cleaning & Thermal Paste', category: 'Laptop & PC', basePrice: 45, estimatedDuration: '60 min', serviceMode: 'On-site', technician: 1,
    description: 'Full dust cleaning, fan service and new thermal paste to stop overheating.' },
  { title: 'Split AC General Service', category: 'AC', basePrice: 60, estimatedDuration: '60 min', serviceMode: 'On-site', technician: 0,
    description: 'Coil cleaning, drain pipe check, gas pressure check and cooling test.' },
  { title: 'AC Gas Refill', category: 'AC', basePrice: 75, estimatedDuration: '45 min', serviceMode: 'On-site', technician: 1,
    description: 'Leak check and R410a gas refill for all split and window AC brands.' },
  { title: 'Refrigerator Cooling Repair', category: 'Refrigerator', basePrice: 95, estimatedDuration: '90 min', serviceMode: 'On-site', technician: 0,
    description: 'Compressor, thermostat and gas repair for fridge and deep freezer.' },
  { title: 'LED TV Backlight Repair', category: 'TV', basePrice: 110, estimatedDuration: '120 min', serviceMode: 'In-store', technician: 1,
    description: 'Screen has sound but no picture? We replace damaged LED backlight strips.' },
  { title: 'Washing Machine Drum Cleaning', category: 'Washing Machine', basePrice: 55, estimatedDuration: '60 min', serviceMode: 'On-site', technician: 0,
    description: 'Deep drum and filter cleaning to remove smell and improve washing quality.' },
  { title: 'Washing Machine Motor Repair', category: 'Washing Machine', basePrice: 130, estimatedDuration: '120 min', serviceMode: 'In-store', technician: 1,
    description: 'Motor, belt and spin problem diagnosis and repair for top and front load machines.' },
  { title: 'Home Electrical Wiring Check', category: 'Electrical', basePrice: 70, estimatedDuration: '90 min', serviceMode: 'On-site', technician: 0,
    description: 'Full socket, switch, earthing and wire load safety inspection with report.' },
  { title: 'Ceiling Fan Installation', category: 'Electrical', basePrice: 40, estimatedDuration: '45 min', serviceMode: 'On-site', technician: 1,
    description: 'Safe ceiling fan installation, wiring connection and speed test.' },
];

// 8 bookings covering every status in the pipeline
const bookings = [
  { status: 'requested', paymentStatus: 'unpaid', dayOffset: -1, service: 0,
    problem: 'Phone fell on the floor, display is completely black with lines.' },
  { status: 'accepted', paymentStatus: 'unpaid', dayOffset: -2, service: 4,
    problem: 'AC is running but not cooling properly since last week, needs full service.' },
  { status: 'accepted', paymentStatus: 'unpaid', dayOffset: -3, service: 9,
    problem: 'Washing machine makes loud noise during spin cycle and shakes heavily.' },
  { status: 'in-progress', paymentStatus: 'unpaid', dayOffset: -2, service: 2,
    problem: 'Laptop is very slow, wants SSD upgrade and fresh Windows installation.' },
  { status: 'completed', paymentStatus: 'unpaid', dayOffset: -5, service: 7,
    problem: 'TV picture is very dim and flickers after 10 minutes of use.' },
  { status: 'completed', paymentStatus: 'paid', dayOffset: -8, service: 5,
    problem: 'AC gas leaked during summer, needs urgent refill and cooling check.' },
  { status: 'rejected', paymentStatus: 'unpaid', dayOffset: -4, service: 10,
    problem: 'Need wiring check for the whole house before renting it out next month.' },
  { status: 'cancelled', paymentStatus: 'unpaid', dayOffset: -6, service: 11,
    problem: 'Want to install two new ceiling fans in the bedroom and kitchen.' },
];

// Run the whole seed
async function seed() {
  const { users, services: servicesCol, bookings: bookingsCol, payments } = await getCollections();

  // 1) Promote the admin account (create it if it does not exist yet)
  await users.updateOne(
    { email: adminEmail },
    {
      $set: { role: 'admin' },
      $setOnInsert: { name: 'FixMate Admin', email: adminEmail, image: '', createdAt: new Date() },
    },
    { upsert: true }
  );

  // 2) Make sure the 2 technician accounts and 1 demo customer exist
  for (const tech of technicians) {
    await users.updateOne(
      { email: tech.email },
      {
        $set: { role: 'technician' },
        $setOnInsert: { ...tech, phone: '', createdAt: new Date() },
      },
      { upsert: true }
    );
  }
  await users.updateOne(
    { email: customer.email },
    {
      $set: { role: 'customer' },
      $setOnInsert: { ...customer, image: '', area: '', bio: '', createdAt: new Date() },
    },
    { upsert: true }
  );

  // 3) Remove old seed data first, so running it twice never duplicates anything
  await servicesCol.deleteMany({ seeded: true });
  await bookingsCol.deleteMany({ seeded: true });
  await payments.deleteMany({ seeded: true });

  // 4) Insert the 12 approved services
  const now = Date.now();
  const serviceDocs = services.map((s, index) => {
    const tech = technicians[s.technician];
    return {
      title: s.title,
      category: s.category,
      description: s.description,
      image: `https://picsum.photos/seed/service${index}/600/400`,
      basePrice: s.basePrice,
      estimatedDuration: s.estimatedDuration,
      serviceMode: s.serviceMode,
      serviceArea: tech.area,
      technicianName: tech.name,
      technicianEmail: tech.email,
      approvalStatus: 'approved',
      isAvailable: true,
      createdAt: new Date(now - (12 - index) * 86400000),
      seeded: true,
    };
  });
  const serviceResult = await servicesCol.insertMany(serviceDocs);
  // insertMany does not return the docs, so attach the generated _ids ourselves
  serviceDocs.forEach((doc, index) => {
    doc._id = serviceResult.insertedIds[index];
  });
  const insertedServices = serviceDocs;

  // 5) Insert the 8 bookings (each one picks a service from the list)
  const bookingDocs = bookings.map((b, index) => {
    const service = insertedServices[b.service];
    const createdAt = new Date(now + b.dayOffset * 86400000);
    return {
      serviceId: String(service._id),
      serviceTitle: service.title,
      serviceImage: service.image,
      category: service.category,
      basePrice: service.basePrice,
      technicianName: service.technicianName,
      technicianEmail: service.technicianEmail,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      address: customer.address,
      preferredDate: new Date(now + (index + 1) * 86400000),
      problemDescription: b.problem,
      status: b.status,
      finalAmount: b.status === 'completed' ? service.basePrice + 15 : service.basePrice,
      paymentStatus: b.paymentStatus,
      statusHistory: [{ status: b.status, changedAt: createdAt }],
      createdAt,
      seeded: true,
    };
  });
  const bookingResult = await bookingsCol.insertMany(bookingDocs);
  bookingDocs.forEach((doc, index) => {
    doc._id = bookingResult.insertedIds[index];
  });
  const insertedBookings = bookingDocs;

  // 6) One payment document for the paid booking (unique stripeSessionId)
  const paidIndex = bookings.findIndex((b) => b.paymentStatus === 'paid');
  const paidBooking = insertedBookings[paidIndex];
  await payments.insertOne({
    bookingId: String(paidBooking._id),
    serviceTitle: paidBooking.serviceTitle,
    customerName: paidBooking.customerName,
    customerEmail: paidBooking.customerEmail,
    technicianName: paidBooking.technicianName,
    technicianEmail: paidBooking.technicianEmail,
    amount: paidBooking.finalAmount,
    currency: 'usd',
    transactionId: 'pi_seed_0001',
    stripeSessionId: 'seed_session_0001', // unique, so a second run never duplicates it
    paymentStatus: 'paid',
    paidAt: paidBooking.createdAt,
    seeded: true,
  });

  console.log(`Seed done: ${insertedServices.length} services, ${insertedBookings.length} bookings, 1 payment`);
  process.exit(0);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
