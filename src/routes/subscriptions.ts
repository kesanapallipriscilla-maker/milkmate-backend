import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { verifyFirebaseToken, requireRole, AuthRequest } from '../middleware/auth';
import { sendPushNotification } from '../services/notification';

const router = Router();

router.use(verifyFirebaseToken, requireRole('CUSTOMER'));

router.get('/my', async (req: AuthRequest, res) => {
  const subscriptions = await prisma.subscription.findMany({
    where: { customer: { userId: req.user!.id }, status: 'ACTIVE' },
    include: {
      vendor: {
        include: {
          products: { where: { isActive: true } },
          user: { select: { name: true, phone: true } },
        },
      },
    },
  });
  return res.json({ subscriptions });
});

const subSchema = z.object({
  vendorId: z.string(),
  daysOfWeek: z.array(z.number().min(0).max(6)).min(1),
  quantityLitres: z.number().positive(),
});

router.post('/', async (req: AuthRequest, res) => {
  const parsed = subSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const vendor = await prisma.vendor.findUnique({ where: { id: parsed.data.vendorId } });
  if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

  // Create or reuse customer record linked to this user
  let customer = await prisma.customer.findFirst({
    where: { userId: req.user!.id, vendorId: parsed.data.vendorId },
  });
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        userId: req.user!.id,
        vendorId: parsed.data.vendorId,
        name: req.user!.name,
        phone: req.user!.phone,
      },
    });
  }

  await prisma.deliverySchedule.upsert({
    where: { customerId: customer.id },
    update: { daysOfWeek: parsed.data.daysOfWeek, quantityLitres: parsed.data.quantityLitres },
    create: {
      customerId: customer.id,
      daysOfWeek: parsed.data.daysOfWeek,
      quantityLitres: parsed.data.quantityLitres,
    },
  });

  const subscription = await prisma.subscription.create({
    data: { customerId: customer.id, vendorId: parsed.data.vendorId },
  });

  // Notify vendor
  await sendPushNotification(
    vendor.userId,
    'New Subscriber',
    `${req.user!.name} subscribed to your milk delivery.`,
    { type: 'subscription' }
  );

  return res.status(201).json({ subscription, customer });
});

router.put('/:id/pause', async (req: AuthRequest, res) => {
  const sub = await prisma.subscription.findFirst({
    where: { id: req.params.id, customer: { userId: req.user!.id } },
  });
  if (!sub) return res.status(404).json({ error: 'Subscription not found' });

  const updated = await prisma.subscription.update({
    where: { id: req.params.id },
    data: { status: 'PAUSED' },
  });
  return res.json({ subscription: updated });
});

router.put('/:id/cancel', async (req: AuthRequest, res) => {
  const sub = await prisma.subscription.findFirst({
    where: { id: req.params.id, customer: { userId: req.user!.id } },
  });
  if (!sub) return res.status(404).json({ error: 'Subscription not found' });

  const updated = await prisma.subscription.update({
    where: { id: req.params.id },
    data: { status: 'CANCELLED' },
  });
  return res.json({ subscription: updated });
});

export default router;
