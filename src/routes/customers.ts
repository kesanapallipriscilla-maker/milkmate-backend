import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { verifyFirebaseToken, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(verifyFirebaseToken, requireRole('VENDOR'));

router.get('/', async (req: AuthRequest, res) => {
  const vendor = await prisma.vendor.findUnique({ where: { userId: req.user!.id } });
  if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

  const customers = await prisma.customer.findMany({
    where: { vendorId: vendor.id, isActive: true },
    include: { deliverySchedule: true },
    orderBy: { name: 'asc' },
  });
  return res.json({ customers });
});

const customerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(10),
  address: z.string().optional(),
  milkType: z.enum(['cow', 'buffalo', 'A2']).optional(),
  slot: z.enum(['morning', 'evening']).optional(),
  quantityLitres: z.number().positive().optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
});

router.post('/', async (req: AuthRequest, res) => {
  const parsed = customerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const vendor = await prisma.vendor.findUnique({ where: { userId: req.user!.id } });
  if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

  const { name, phone, address, milkType, slot, quantityLitres, daysOfWeek } = parsed.data;

  const customer = await prisma.customer.create({
    data: {
      name,
      phone,
      address,
      vendorId: vendor.id,
      schedule: { milkType: milkType ?? 'cow', slot: slot ?? 'morning' },
      ...(daysOfWeek && daysOfWeek.length > 0
        ? {
            deliverySchedule: {
              create: {
                daysOfWeek,
                quantityLitres: quantityLitres ?? 1,
              },
            },
          }
        : {}),
    },
    include: { deliverySchedule: true },
  });
  return res.status(201).json({ customer });
});

router.put('/:id', async (req: AuthRequest, res) => {
  const parsed = customerSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const vendor = await prisma.vendor.findUnique({ where: { userId: req.user!.id } });
  const customer = await prisma.customer.findFirst({
    where: { id: req.params.id, vendorId: vendor?.id },
  });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const updated = await prisma.customer.update({
    where: { id: req.params.id },
    data: parsed.data,
  });
  return res.json({ customer: updated });
});

router.delete('/:id', async (req: AuthRequest, res) => {
  const vendor = await prisma.vendor.findUnique({ where: { userId: req.user!.id } });
  const customer = await prisma.customer.findFirst({
    where: { id: req.params.id, vendorId: vendor?.id },
  });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  await prisma.customer.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });
  return res.json({ message: 'Customer deactivated' });
});

export default router;
