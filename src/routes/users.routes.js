import { Router } from 'express';
import { getCollections } from '../config/db.js';
import { verifyToken } from '../middlewares/auth.js';

const router = Router();

// CUSTOMER/TECHNICIAN: update own profile (only these 5 fields)
router.patch('/profile', verifyToken, async (req, res) => {
  const { name, phone, area, bio, image } = req.body;
  const updates = { updatedAt: new Date() };
  if (name?.trim()) updates.name = name.trim();
  if (phone !== undefined) updates.phone = phone;
  if (area !== undefined) updates.area = area;
  if (bio !== undefined) updates.bio = bio;
  if (image) updates.image = image;
  const { users } = await getCollections();
  // Always update the logged-in user, never an email from the client
  await users.updateOne({ email: req.user.email }, { $set: updates });
  res.send({ message: 'Profile updated' });
});

export default router;
