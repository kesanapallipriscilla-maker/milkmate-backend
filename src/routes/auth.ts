import { Router } from 'express';
import { z } from 'zod';
import { auth } from '../lib/firebase';
import prisma from '../lib/prisma';
import { verifyFirebaseToken, AuthRequest } from '../middleware/auth';

const router = Router();

const registerSchema = z.object({
  firebaseToken: z.string(),
  name: z.string().min(1),
  role: z.enum(['VENDOR', 'CUSTOMER']),
});

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { firebaseToken, name, role } = parsed.data;
  try {
    const decoded = await auth.verifyIdToken(firebaseToken);
    const phone = decoded.phone_number;
    if (!phone) return res.status(400).json({ error: 'Token missing phone number' });

    const user = await prisma.user.upsert({
      where: { firebaseUid: decoded.uid },
      update: { name },
      create: { firebaseUid: decoded.uid, phone, name, role },
    });

    if (role === 'VENDOR') {
      await prisma.vendor.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id, name, phone },
      });
    }

    return res.status(201).json({ user });
  } catch {
    return res.status(401).json({ error: 'Invalid Firebase token' });
  }
});

router.get('/me', verifyFirebaseToken, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { vendor: { include: { products: true } } },
  });
  return res.json({ user });
});

export default router;
