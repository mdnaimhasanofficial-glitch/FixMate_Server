import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollections } from '../config/db.js';
import { verifyToken, verifyCustomer, verifyTechnician } from '../middlewares/auth.js';
import { canChange, ACTIVE_STATUSES } from '../utils/statusRules.js';
import { getPlanStatus } from '../utils/subscription.js';

const router = Router();

// ১) CUSTOMER: repair request পাঠানো
router.post('/', verifyToken, verifyCustomer, async (req, res) => {
  const { serviceId, customerPhone, address, preferredDate, problemDescription } = req.body;
  if (!ObjectId.isValid(serviceId)) return res.status(400).send({ message: 'Invalid service' });
  // Validate phone, address, preferredDate and problemDescription
  if (!customerPhone || !address) {
    return res.status(400).send({ message: 'Phone and address are required' });
  }
  if (!problemDescription || problemDescription.trim().length < 20) {
    return res.status(400).send({ message: 'Problem description must be at least 20 characters' });
  }
  // তারিখ আজ বা ভবিষ্যেতে হতে হবে
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (!preferredDate || new Date(preferredDate) < today) {
    return res.status(400).send({ message: 'Preferred date must be today or a future date' });
  }
  // FREE PLAN LIMIT: free customers stop at 5 bookings, Pro customers are unlimited.
  // The check runs on the server only, so the frontend can never bypass it.
  const planStatus = await getPlanStatus(req.user.email);
  if (!planStatus.canBook) {
    return res.status(403).send({
      code: 'FREE_LIMIT_REACHED',
      message: 'Upgrade to Pro to book more services',
    });
  }
  const { services, bookings } = await getCollections();
  // Service must be approved and available
  const service = await services.findOne({
    _id: new ObjectId(serviceId),
    approvalStatus: 'approved',
    isAvailable: true,
  });
  if (!service) return res.status(404).send({ message: 'Service not found' });
  // A technician cannot request their own service
  if (service.technicianEmail === req.user.email) {
    return res.status(400).send({ message: 'You cannot request your own service' });
  }
  // Same customer + same service with an active request? -> 409
  const existing = await bookings.findOne({
    serviceId: String(service._id),
    customerEmail: req.user.email,
    status: { $in: ACTIVE_STATUSES },
  });
  if (existing) {
    return res.status(409).send({ message: 'You already have an active request for this service' });
  }
  const now = new Date();
  // Copy service and technician info into the booking
  const result = await bookings.insertOne({
    serviceId: String(service._id),
    serviceTitle: service.title,
    serviceImage: service.image,
    category: service.category,
    basePrice: service.basePrice,
    technicianName: service.technicianName,
    technicianEmail: service.technicianEmail,
    customerName: req.user.name,
    customerEmail: req.user.email,
    customerPhone,
    address,
    preferredDate: new Date(preferredDate),
    problemDescription: problemDescription.trim(),
    status: 'requested',
    finalAmount: service.basePrice,
    paymentStatus: 'unpaid',
    statusHistory: [{ status: 'requested', changedAt: now }],
    createdAt: now,
  });
  res.status(201).send({ insertedId: result.insertedId });
});

// ২) CUSTOMER: নিজের সব booking
router.get('/my', verifyToken, verifyCustomer, async (req, res) => {
  const { bookings } = await getCollections();
  const list = await bookings
    .find({ customerEmail: req.user.email })
    .sort({ createdAt: -1 })
    .toArray();
  res.send(list);
});

// ৩) CUSTOMER: cancel (শুধু 'requested' থাকলে)
router.patch('/:id/cancel', verifyToken, verifyCustomer, async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return res.status(404).send({ message: 'Booking not found' });
  const { bookings } = await getCollections();
  // Only the booking owner can cancel
  const booking = await bookings.findOne({ _id: new ObjectId(id), customerEmail: req.user.email });
  if (!booking) return res.status(404).send({ message: 'Booking not found' });
  if (!canChange(booking.status, 'cancelled', 'customer')) {
    return res.status(400).send({ message: 'Only a requested job can be cancelled' });
  }
  await bookings.updateOne(
    { _id: booking._id },
    {
      $set: { status: 'cancelled' },
      $push: { statusHistory: { status: 'cancelled', changedAt: new Date() } },
    }
  );
  res.send({ message: 'Booking cancelled' });
});

// ৪) TECHNICIAN: নিজের কাজে আসা সব request (?status=requested ইত্যাদি)
router.get('/technician', verifyToken, verifyTechnician, async (req, res) => {
  const { bookings } = await getCollections();
  const query = { technicianEmail: req.user.email };
  if (req.query.status) query.status = req.query.status;
  const list = await bookings.find(query).sort({ createdAt: -1 }).toArray();
  res.send(list);
});

// ৫) TECHNICIAN: status বদলানো (Challenge 3-এর মূল অংশ)
router.patch('/:id/status', verifyToken, verifyTechnician, async (req, res) => {
  const { id } = req.params;
  const { status, finalAmount } = req.body;
  if (!ObjectId.isValid(id)) return res.status(404).send({ message: 'Booking not found' });
  // status is required
  if (!status) return res.status(400).send({ message: 'Status is required' });
  const { bookings } = await getCollections();
  // শুধু নিজের job খুঁজবে, অন্যের job হলে "পাওয়া যায় না"
  const booking = await bookings.findOne({ _id: new ObjectId(id), technicianEmail: req.user.email });
  if (!booking) return res.status(404).send({ message: 'Booking not found' });
  if (!canChange(booking.status, status, 'technician')) {
    return res
      .status(400)
      .send({ message: `Cannot change status from ${booking.status} to ${status}` });
  }
  const updates = { status };
  if (status === 'completed') {
    const amount = Number(finalAmount);
    if (!(amount > 0)) {
      return res.status(400).send({ message: 'Final amount must be greater than 0' });
    }
    updates.finalAmount = amount;
  }
  await bookings.updateOne(
    { _id: booking._id },
    { $set: updates, $push: { statusHistory: { status, changedAt: new Date() } } }
  );
  res.send({ message: `Job marked as ${status}` });
});

export default router;
