import { Router } from 'express';
import { getCollections } from '../config/db.js';
import { verifyToken } from '../middlewares/auth.js';
import { ACTIVE_STATUSES } from '../utils/statusRules.js';
const router = Router();
router.get('/', verifyToken, async (req, res) => {
const { users, services, bookings, payments } = await getCollections();
const { role, email } = req.user;
// chart-এর জন্য: [{ status: 'requested', count: 3 }, ...]
const byStatus = async (match) => {
const rows = await bookings.aggregate([{ $match: match }, { $group: { _id: '$status', count: { 
$sum: 1 } } }]).toArray();
return rows.map((row) => ({ status: row._id, count: row.count }));
};
if (role === 'customer') {
const mine = { customerEmail: email };
return res.send({
totalRequests: await bookings.countDocuments(mine),
activeJobs: await bookings.countDocuments({ ...mine, status: { $in: ACTIVE_STATUSES } }),
completedJobs: await bookings.countDocuments({ ...mine, status: 'completed' }),
chart: await byStatus(mine),
});
}
if (role === 'technician') {
const mine = { technicianEmail: email };
return res.send({
totalServices: await services.countDocuments(mine),
approvedServices: await services.countDocuments({ ...mine, approvalStatus: 'approved' }),
pendingRequests: await bookings.countDocuments({ ...mine, status: 'requested' }),
chart: await byStatus(mine),
});
}
// admin
const revenue = await payments.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } 
}]).toArray();
res.send({
totalUsers: await users.countDocuments(),
totalTechnicians: await users.countDocuments({ role: 'technician' }),
pendingServices: await services.countDocuments({ approvalStatus: 'pending' }),
totalRevenue: revenue[0]?.total || 0,
chart: await byStatus({}),
});
});
export default router;