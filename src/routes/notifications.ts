import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { verifyFirebaseToken, AuthRequest } from '../middleware/auth';
import { sendPushNotification } from '../services/notification';

const router = Router();

router.use(verifyFirebaseToken);

const tokenSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['android', 'ios']),
});

router.post('/fcm-token', async (req: AuthRequest, res) => {
  const parsed = tokenSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  await prisma.fcmToken.upsert({
    where: { token: parsed.data.token },
    update: { userId: req.user!.id },
    create: { userId: req.user!.id, ...parsed.data },
  });
  return res.json({ message: 'Token registered' });
});

router.get('/', async (req: AuthRequest, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return res.json({ notifications });
});

router.put('/:id/read', async (req: AuthRequest, res) => {
  const notif = await prisma.notification.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
  });
  if (!notif) return res.status(404).json({ error: 'Notification not found' });

  await prisma.notification.update({ where: { id: req.params.id }, data: { isRead: true } });
  return res.json({ message: 'Marked as read' });
});

// Vendor: send payment reminder to a customer
router.post('/payment-reminder', async (req: AuthRequest, res) => {
  const { customerId } = req.body;
  if (!customerId) return res.status(400).json({ error: 'customerId is required' });

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { bills: { where: { isPaid: false }, orderBy: { generatedAt: 'desc' }, take: 1 } },
  });
  if (!customer?.userId) return res.status(404).json({ error: 'Customer app user not found' });

  const due = customer.bills[0];
  const amount = due ? `₹${due.totalAmount.toFixed(0)}` : 'outstanding dues';

  await sendPushNotification(
    customer.userId,
    'Payment Reminder',
    `You have ${amount} pending. Please clear your milk payment.`,
    { type: 'payment_reminder' }
  );
  return res.json({ message: 'Reminder sent' });
});

export default router;
