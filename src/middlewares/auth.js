import jwt from 'jsonwebtoken';
import { getCollections } from '../config/db.js';
// ১) Token আেছ িক, িঠক িক, ইউজার database-এ আেছ িক
export const verifyToken = async (req, res, next) => {
const authHeader = req.headers.authorization;
if (!authHeader?.startsWith('Bearer ')) {
return res.status(401).send({ message: 'Unauthorized' });
}
try {
const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
const { users } = await getCollections();
const user = await users.findOne({ email: decoded.email });
if (!user) return res.status(401).send({ message: 'Unauthorized' });
req.user = { email: user.email, name: user.name, role: user.role || 'customer' };
next();
} catch (error) {
return res.status(401).send({ message: 'Unauthorized' });
}
};
// ২) Role িমলেছ িক
const requireRole = (role) => (req, res, next) => {
if (req.user?.role !== role) return res.status(403).send({ message: 'Forbidden' });
next();
};
export const verifyCustomer = requireRole('customer');
export const verifyTechnician = requireRole('technician');
export const verifyAdmin = requireRole('admin');