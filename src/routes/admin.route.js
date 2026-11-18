import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getCollections } from '../config/db.js';
import { verifyToken, verifyAdmin } from '../middlewares/auth.js';
const router = Router();
router.use(verifyToken, verifyAdmin); // িনেচর সব route-এ পেযাজ
router.get('/users', async (req, res) => {
const { users } = await getCollections();
res.send(await users.find({}).sort({ createdAt: -1 }).toArray());
});
router.patch('/users/:id/role', async (req, res) => {
const { role } = req.body;
if (!['customer', 'technician', 'admin'].includes(role)) {
return res.status(400).send({ message: 'Invalid role' });
}
if (!ObjectId.isValid(req.params.id)) return res.status(404).send({ message: 'User not found' });
const { users } = await getCollections();
const target = await users.findOne({ _id: new ObjectId(req.params.id) });
if (!target) return res.status(404).send({ message: 'User not found' });
if (target.email === req.user.email) {
return res.status(400).send({ message: 'You cannot change your own role' });
}
await users.updateOne({ _id: target._id }, { $set: { role } });
res.send({ message: 'Role updated' });
});
// সব service (pending আেগ দখােনার জন্য client-এ sort করেব বা ?status= দেব)
router.get('/services', async (req, res) => {
const { services } = await getCollections();
const query = req.query.status ? { approvalStatus: req.query.status } : {};
res.send(await services.find(query).sort({ createdAt: -1 }).toArray());
});
router.patch('/services/:id/approval', async (req, res) => {
const { approvalStatus } = req.body;
if (!['approved', 'rejected'].includes(approvalStatus)) {
return res.status(400).send({ message: 'Invalid approval status' });
}
if (!ObjectId.isValid(req.params.id)) return res.status(404).send({ message: 'Service not found' 
});
const { services } = await getCollections();
const result = await services.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { 
approvalStatus } });
if (result.matchedCount === 0) return res.status(404).send({ message: 'Service not found' });
res.send({ message: `Service ${approvalStatus}` });
});
router.get('/bookings', async (req, res) => {
const { bookings } = await getCollections();
const query = req.query.status ? { status: req.query.status } : {};
res.send(await bookings.find(query).sort({ createdAt: -1 }).toArray());
});
router.get('/payments', async (req, res) => {
const { payments } = await getCollections();
const list = await payments.find({}).sort({ paidAt: -1 }).toArray();
const totalRevenue = list.reduce((sum, p) => sum + p.amount, 0);
res.send({ payments: list, totalRevenue });
});
export default router;