import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollections } from '../config/db.js';
import { verifyToken, verifyTechnician } from '../middlewares/auth.js';
const router = Router();
// Special regex characters must be escaped or the search breaks
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ১) PUBLIC: list approved + available services (search, filter, sort, pagination)
router.get('/', async (req, res) => {
  const { services } = await getCollections();
  const { search, category, serviceMode, sort, page = 1, limit = 9 } = req.query;
  // Only approved and available services are public
  const query = { approvalStatus: 'approved', isAvailable: true };
  if (category) query.category = category;
  if (serviceMode) query.serviceMode = serviceMode;
  // Search in title or category, case-insensitive (regex escaped)
  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    query.$or = [{ title: regex }, { category: regex }];
  }
  // Sorting happens in MongoDB
  const sortOptions = {
    'price-asc': { basePrice: 1 },
    'price-desc': { basePrice: -1 },
    newest: { createdAt: -1 },
  };
  const sortBy = sortOptions[sort] || sortOptions.newest;
  const pageNumber = Math.max(Number(page) || 1, 1);
  const limitNumber = Math.max(Number(limit) || 9, 1);
  // Pagination also happens in MongoDB (skip + limit)
  const items = await services
    .find(query)
    .sort(sortBy)
    .skip((pageNumber - 1) * limitNumber)
    .limit(limitNumber)
    .toArray();
  const total = await services.countDocuments(query);
  res.send({ items, total, totalPages: Math.ceil(total / limitNumber) });
});

// ২) TECHNICIAN: own services (must stay BEFORE /:id, otherwise /my reads as an id)
router.get('/my', verifyToken, verifyTechnician, async (req, res) => {
  const { services } = await getCollections();
  const list = await services
    .find({ technicianEmail: req.user.email })
    .sort({ createdAt: -1 })
    .toArray();
  res.send(list);
});

// ৩) PUBLIC: one service details (404 if invalid id, not found or not approved)
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return res.status(404).send({ message: 'Service not found' });
  const { services, users } = await getCollections();
  const service = await services.findOne({
    _id: new ObjectId(id),
    approvalStatus: 'approved',
  });
  if (!service) return res.status(404).send({ message: 'Service not found' });
  // Add the technician name, image, area and bio
  const technician = await users.findOne(
    { email: service.technicianEmail },
    { projection: { name: 1, image: 1, area: 1, bio: 1 } }
  );
  res.send({ ...service, technician });
});

// ৪) TECHNICIAN: service যাগ করা
router.post('/', verifyToken, verifyTechnician, async (req, res) => {
  const { title, category, description, image, basePrice, estimatedDuration, serviceMode, 
serviceArea } = req.body;
  if (!title || !category || !description || !image || !estimatedDuration || !serviceMode || 
!serviceArea) {
    return res.status(400).send({ message: 'Please fill in all required fields' });
  }
  if (!(Number(basePrice) > 0)) {
    return res.status(400).send({ message: 'Base price must be a positive number' });
  }
  const { services } = await getCollections();
  const result = await services.insertOne({
    title, category, description, image,
    basePrice: Number(basePrice),
    estimatedDuration, serviceMode, serviceArea,
    technicianName: req.user.name,   // body থেক নয়, logged-in user থেক
    technicianEmail: req.user.email,
    approvalStatus: 'pending',
    isAvailable: true,
    createdAt: new Date(),
  });
  res.status(201).send({ insertedId: result.insertedId });
});

// ৫) TECHNICIAN: edit (শুধু িনেজর service)। edit করেল আবার 'pending'
router.patch('/:id', verifyToken, verifyTechnician, async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return res.status(404).send({ message: 'Service not found' });
  const allowedFields = ['title', 'category', 'description', 'image', 'basePrice', 
'estimatedDuration', 'serviceMode', 'serviceArea'];
  const updates = {};
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });
  if (updates.basePrice !== undefined) updates.basePrice = Number(updates.basePrice);
  updates.approvalStatus = 'pending';
  const { services } = await getCollections();
  const result = await services.updateOne(
    { _id: new ObjectId(id), technicianEmail: req.user.email }, // owner check
    { $set: updates }
  );
  if (result.matchedCount === 0) return res.status(404).send({ message: 'Service not found' });
  res.send({ message: 'Service updated and sent for approval' });
});

// ৬) TECHNICIAN: availability on/off (approval বদলায় না)
router.patch('/:id/availability', verifyToken, verifyTechnician, async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return res.status(404).send({ message: 'Service not found' });
  const { services } = await getCollections();
  const result = await services.updateOne(
    { _id: new ObjectId(id), technicianEmail: req.user.email },
    { $set: { isAvailable: Boolean(req.body.isAvailable) } }
  );
  if (result.matchedCount === 0) return res.status(404).send({ message: 'Service not found' });
  res.send({ message: 'Availability updated' });
});

// ৭) TECHNICIAN: delete (শুধু িনেজর)
router.delete('/:id', verifyToken, verifyTechnician, async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return res.status(404).send({ message: 'Service not found' });
  const { services } = await getCollections();
const result = await services.deleteOne({ _id: new ObjectId(id), technicianEmail: req.user.email 
});
if (result.deletedCount === 0) return res.status(404).send({ message: 'Service not found' });
res.send({ message: 'Service deleted' });
});

export default router;
