import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { verifyFirebaseToken, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(verifyFirebaseToken, requireRole('VENDOR'));

router.get('/:customerId', async (req: AuthRequest, res) => {
  const vendor = await prisma.vendor.findUnique({ where: { userId: req.user!.id } });
  const customer = await prisma.customer.findFirst({
    where: { id: req.params.customerId, vendorId: vendor?.id },
    include: { schedule: true },
  });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  return res.json({ schedule: customer.schedule });
});

const scheduleSchema = z.object({
  customerId: z.string(),
  daysOfWeek: z.array(z.number().min(0).max(6)).min(1),
  quantityLitres: z.number().positive(),
  startDate: z.string().datetime().optional(),
});

router.post('/', async (req: AuthRequest, res) => {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const vendor = await prisma.vendor.findUnique({ where: { userId: req.user!.id } });
  const customer = await prisma.customer.findFirst({
    where: { id: parsed.data.customerId, vendorId: vendor?.id },
  });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const schedule = await prisma.deliverySchedule.upsert({
    where: { customerId: parsed.data.customerId },
    update: {
      daysOfWeek: parsed.data.daysOfWeek,
      quantityLitres: parsed.data.quantityLitres,
    },
    create: {
      customerId: parsed.data.customerId,
      daysOfWeek: parsed.data.daysOfWeek,
      quantityLitres: parsed.data.quantityLitres,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
    },
  });
  return res.status(201).json({ schedule });
});

router.put('/:id', async (req: AuthRequest, res) => {
  const parsed = scheduleSchema.partial().omit({ customerId: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const schedule = await prisma.deliverySchedule.update({
    where: { id: req.params.id },
    data: parsed.data,
  });
  return res.json({ schedule });
});

export default router;
