import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { verifyFirebaseToken, requireRole, AuthRequest } from '../middleware/auth';
import { sendPushNotification } from '../services/notification';

const router = Router();

router.use(verifyFirebaseToken);

// Returns today's scheduled deliveries, auto-initializing PENDING records if missing
router.get('/today', requireRole('VENDOR'), async (req: AuthRequest, res) => {
  const vendor = await prisma.vendor.findUnique({ where: { userId: req.user!.id } });
  if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfWeek = today.getDay();

  const customers = await prisma.customer.findMany({
    where: { vendorId: vendor.id, isActive: true },
    include: { deliverySchedule: true },
  });

  const totalCustomers = customers.length;

  const scheduled = customers.filter(
    (c) => c.deliverySchedule && c.deliverySchedule.daysOfWeek.includes(dayOfWeek)
  );

  // Upsert PENDING records for all scheduled customers that don't have a record yet
  await Promise.all(
    scheduled.map((c) =>
      prisma.delivery.upsert({
        where: { customerId_date: { customerId: c.id, date: today } },
        update: {},
        create: {
          customerId: c.id,
          date: today,
          status: 'PENDING',
          quantity: c.deliverySchedule!.quantityLitres,
        },
      })
    )
  );

  const deliveries = await prisma.delivery.findMany({
    where: { date: today, customer: { vendorId: vendor.id } },
    include: { customer: { select: { id: true, name: true, phone: true, address: true } } },
    orderBy: { customer: { name: 'asc' } },
  });

  return res.json({ deliveries, totalCustomers });
});

router.get('/', requireRole('VENDOR'), async (req: AuthRequest, res) => {
  const { date, customerId } = req.query as Record<string, string>;
  const vendor = await prisma.vendor.findUnique({ where: { userId: req.user!.id } });

  const deliveries = await prisma.delivery.findMany({
    where: {
      customer: { vendorId: vendor?.id },
      ...(date ? { date: new Date(date) } : {}),
      ...(customerId ? { customerId } : {}),
    },
    include: { customer: { select: { name: true, phone: true } } },
    orderBy: { date: 'desc' },
  });
  return res.json({ deliveries });
});

const markSchema = z.object({
  customerId: z.string(),
  date: z.string(),
  status: z.enum(['DELIVERED', 'SKIPPED', 'PENDING']),
  quantity: z.number().positive().optional(),
});

router.post('/mark', requireRole('VENDOR'), async (req: AuthRequest, res) => {
  const parsed = markSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const vendor = await prisma.vendor.findUnique({ where: { userId: req.user!.id } });
  const customer = await prisma.customer.findFirst({
    where: { id: parsed.data.customerId, vendorId: vendor?.id },
    include: { deliverySchedule: true },
  });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const quantity = parsed.data.quantity ?? customer.deliverySchedule?.quantityLitres ?? 1;

  const delivery = await prisma.delivery.upsert({
    where: {
      customerId_date: {
        customerId: parsed.data.customerId,
        date: new Date(parsed.data.date),
      },
    },
    update: { status: parsed.data.status, quantity },
    create: {
      customerId: parsed.data.customerId,
      date: new Date(parsed.data.date),
      status: parsed.data.status,
      quantity,
    },
  });

  if (parsed.data.status === 'DELIVERED' && customer.userId) {
    await sendPushNotification(
      customer.userId,
      'Milk Delivered',
      `Your ${quantity}L milk has been delivered today.`,
      { type: 'delivery' }
    );
  }

  return res.json({ delivery });
});

router.post('/bulk-mark', requireRole('VENDOR'), async (req: AuthRequest, res) => {
  const { date, status = 'DELIVERED' } = req.body as { date: string; status?: string };
  if (!date) return res.status(400).json({ error: 'date is required' });

  const vendor = await prisma.vendor.findUnique({ where: { userId: req.user!.id } });
  const customers = await prisma.customer.findMany({
    where: { vendorId: vendor?.id, isActive: true },
    include: { deliverySchedule: true },
  });

  const targetDate = new Date(date);
  const dayOfWeek = targetDate.getDay();

  const eligible = customers.filter(
    (c) => c.deliverySchedule && c.deliverySchedule.daysOfWeek.includes(dayOfWeek)
  );

  const upserts = eligible.map((c) =>
    prisma.delivery.upsert({
      where: { customerId_date: { customerId: c.id, date: targetDate } },
      update: { status: status as any },
      create: {
        customerId: c.id,
        date: targetDate,
        status: status as any,
        quantity: c.deliverySchedule!.quantityLitres,
      },
    })
  );

  await Promise.all(upserts);
  return res.json({ message: `Marked ${eligible.length} deliveries as ${status}` });
});

// Customer: view own deliveries
router.get('/my', requireRole('CUSTOMER'), async (req: AuthRequest, res) => {
  const customers = await prisma.customer.findMany({
    where: { userId: req.user!.id },
    include: {
      deliveries: { orderBy: { date: 'desc' }, take: 30 },
    },
  });
  return res.json({ customers });
});

export default router;
