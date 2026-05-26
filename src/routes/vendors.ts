import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { verifyFirebaseToken, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

function haversineFilter(lat: number, lng: number, radius: number) {
  return `
    (6371 * acos(
      cos(radians(${lat})) * cos(radians(v.lat)) *
      cos(radians(v.lng) - radians(${lng})) +
      sin(radians(${lat})) * sin(radians(v.lat))
    )) <= ${radius}
  `;
}

router.get('/', async (req, res) => {
  const { lat, lng, radius = '10' } = req.query as Record<string, string>;

  if (lat && lng) {
    const vendors = await prisma.$queryRawUnsafe<any[]>(`
      SELECT v.*,
        ROUND(AVG(r.stars)::numeric, 1) AS avg_rating,
        COUNT(r.id) AS review_count
      FROM vendors v
      LEFT JOIN reviews r ON r."vendorId" = v.id
      WHERE v."isActive" = true
        AND v.lat IS NOT NULL AND v.lng IS NOT NULL
        AND ${haversineFilter(parseFloat(lat), parseFloat(lng), parseFloat(radius))}
      GROUP BY v.id
      ORDER BY avg_rating DESC NULLS LAST
    `);
    return res.json({ vendors });
  }

  const vendors = await prisma.vendor.findMany({
    where: { isActive: true },
    include: {
      products: { where: { isActive: true } },
      reviews: { select: { stars: true } },
    },
  });
  return res.json({ vendors });
});

router.get('/analytics', verifyFirebaseToken, requireRole('VENDOR'), async (req: AuthRequest, res) => {
  const vendor = await prisma.vendor.findUnique({ where: { userId: req.user!.id } });
  if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [revenueByMonth, topCustomers, deliveryStats] = await Promise.all([
    prisma.payment.groupBy({
      by: ['date'],
      where: {
        customer: { vendorId: vendor.id },
        status: 'SUCCESS',
        date: { gte: sixMonthsAgo },
      },
      _sum: { amount: true },
    }),
    prisma.payment.groupBy({
      by: ['customerId'],
      where: { customer: { vendorId: vendor.id }, status: 'SUCCESS' },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 5,
    }),
    prisma.delivery.groupBy({
      by: ['status'],
      where: { customer: { vendorId: vendor.id } },
      _count: true,
    }),
  ]);

  return res.json({ revenueByMonth, topCustomers, deliveryStats });
});

router.get('/:id', async (req, res) => {
  const vendor = await prisma.vendor.findUnique({
    where: { id: req.params.id },
    include: {
      products: { where: { isActive: true } },
      reviews: {
        include: { user: { select: { name: true } } },
        orderBy: { date: 'desc' },
        take: 20,
      },
    },
  });
  if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
  return res.json({ vendor });
});

const profileSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  photo: z.string().url().optional(),
});

router.put('/profile', verifyFirebaseToken, requireRole('VENDOR'), async (req: AuthRequest, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const vendor = await prisma.vendor.update({
    where: { userId: req.user!.id },
    data: parsed.data,
  });
  return res.json({ vendor });
});

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  location: z.string().optional(),
});

router.put('/location', verifyFirebaseToken, requireRole('VENDOR'), async (req: AuthRequest, res) => {
  const parsed = locationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const vendor = await prisma.vendor.update({
    where: { userId: req.user!.id },
    data: parsed.data,
  });
  return res.json({ vendor });
});

// Recompute and store vendor rating after a new review
export async function refreshVendorRating(vendorId: string) {
  const result = await prisma.review.aggregate({
    where: { vendorId },
    _avg: { stars: true },
  });
  await prisma.vendor.update({
    where: { id: vendorId },
    data: { rating: result._avg.stars ?? 0 },
  });
}

export default router;
