import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { verifyFirebaseToken, requireRole, AuthRequest } from '../middleware/auth';
import { refreshVendorRating } from './vendors';

const router = Router();

const subRatingField = z.number().int().min(1).max(5).optional();

const reviewSchema = z.object({
  vendorId: z.string(),
  stars: z.number().int().min(1).max(5),
  milkQuality: subRatingField,
  freshness: subRatingField,
  punctuality: subRatingField,
  vendorBehaviour: subRatingField,
  comment: z.string().max(500).optional(),
});

// Public: all reviews for a vendor
router.get('/vendor/:vendorId', async (req, res) => {
  const reviews = await prisma.review.findMany({
    where: { vendorId: req.params.vendorId },
    include: { user: { select: { name: true } } },
    orderBy: { date: 'desc' },
  });
  return res.json({ reviews });
});

// Authenticated: current customer's own review for a vendor (null if none)
router.get('/my/:vendorId', verifyFirebaseToken, requireRole('CUSTOMER'), async (req: AuthRequest, res) => {
  const review = await prisma.review.findUnique({
    where: { userId_vendorId: { userId: req.user!.id, vendorId: req.params.vendorId } },
  });
  return res.json({ review: review ?? null });
});

router.post('/', verifyFirebaseToken, requireRole('CUSTOMER'), async (req: AuthRequest, res) => {
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const customer = await prisma.customer.findFirst({
    where: { userId: req.user!.id, vendorId: parsed.data.vendorId },
  });
  if (!customer) return res.status(403).json({ error: 'You must be a customer of this vendor to review' });

  const { vendorId, stars, milkQuality, freshness, punctuality, vendorBehaviour, comment } = parsed.data;

  const review = await prisma.review.upsert({
    where: { userId_vendorId: { userId: req.user!.id, vendorId } },
    update: { stars, milkQuality, freshness, punctuality, vendorBehaviour, comment },
    create: {
      userId: req.user!.id,
      customerId: customer.id,
      vendorId,
      stars,
      milkQuality,
      freshness,
      punctuality,
      vendorBehaviour,
      comment,
    },
  });

  await refreshVendorRating(vendorId);

  return res.status(201).json({ review });
});

router.put('/:id', verifyFirebaseToken, requireRole('CUSTOMER'), async (req: AuthRequest, res) => {
  const parsed = reviewSchema.partial().omit({ vendorId: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const review = await prisma.review.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
  });
  if (!review) return res.status(404).json({ error: 'Review not found' });

  const updated = await prisma.review.update({
    where: { id: req.params.id },
    data: parsed.data,
  });

  await refreshVendorRating(review.vendorId);

  return res.json({ review: updated });
});

export default router;
