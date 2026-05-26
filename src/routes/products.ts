import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { verifyFirebaseToken, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(verifyFirebaseToken, requireRole('VENDOR'));

router.get('/', async (req: AuthRequest, res) => {
  const vendor = await prisma.vendor.findUnique({ where: { userId: req.user!.id } });
  if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

  const products = await prisma.milkProduct.findMany({
    where: { vendorId: vendor.id, isActive: true },
  });
  return res.json({ products });
});

const productSchema = z.object({
  type: z.string().min(1),
  pricePerLitre: z.number().positive(),
});

router.post('/', async (req: AuthRequest, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const vendor = await prisma.vendor.findUnique({ where: { userId: req.user!.id } });
  if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

  const product = await prisma.milkProduct.create({
    data: { ...parsed.data, vendorId: vendor.id },
  });
  return res.status(201).json({ product });
});

router.put('/:id', async (req: AuthRequest, res) => {
  const parsed = productSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const vendor = await prisma.vendor.findUnique({ where: { userId: req.user!.id } });
  const product = await prisma.milkProduct.findFirst({
    where: { id: req.params.id, vendorId: vendor?.id },
  });
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const updated = await prisma.milkProduct.update({
    where: { id: req.params.id },
    data: parsed.data,
  });
  return res.json({ product: updated });
});

router.delete('/:id', async (req: AuthRequest, res) => {
  const vendor = await prisma.vendor.findUnique({ where: { userId: req.user!.id } });
  const product = await prisma.milkProduct.findFirst({
    where: { id: req.params.id, vendorId: vendor?.id },
  });
  if (!product) return res.status(404).json({ error: 'Product not found' });

  await prisma.milkProduct.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });
  return res.json({ message: 'Product removed' });
});

export default router;
