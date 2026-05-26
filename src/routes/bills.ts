import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { verifyFirebaseToken, requireRole, AuthRequest } from '../middleware/auth';
import { sendPushNotification } from '../services/notification';

const router = Router();

router.use(verifyFirebaseToken);

async function generateBillForCustomer(customerId: string, month: number, year: number) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  const deliveries = await prisma.delivery.findMany({
    where: {
      customerId,
      status: 'DELIVERED',
      date: { gte: startDate, lte: endDate },
    },
  });

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { deliverySchedule: true },
  });

  const pricePerLitre = 60; // default; ideally fetched from vendor's product config
  const totalDeliveries = deliveries.length;
  const totalAmount = deliveries.reduce((sum, d) => sum + d.quantity * pricePerLitre, 0);

  const bill = await prisma.bill.upsert({
    where: { customerId_month_year: { customerId, month, year } },
    update: { totalDeliveries, totalAmount },
    create: { customerId, month, year, totalDeliveries, totalAmount },
  });

  if (customer?.userId) {
    await sendPushNotification(
      customer.userId,
      'Monthly Bill Ready',
      `Your bill for ${month}/${year} is ₹${totalAmount.toFixed(0)}. Tap to pay.`,
      { type: 'bill', billId: bill.id }
    );
  }

  return bill;
}

const generateSchema = z.object({
  customerId: z.string().optional(),
  month: z.number().min(1).max(12),
  year: z.number().min(2020),
});

router.post('/generate', requireRole('VENDOR'), async (req: AuthRequest, res) => {
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const vendor = await prisma.vendor.findUnique({ where: { userId: req.user!.id } });
  if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

  if (parsed.data.customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: parsed.data.customerId, vendorId: vendor.id },
    });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const bill = await generateBillForCustomer(parsed.data.customerId, parsed.data.month, parsed.data.year);
    return res.json({ bill });
  }

  const customers = await prisma.customer.findMany({
    where: { vendorId: vendor.id, isActive: true },
  });
  const bills = await Promise.all(
    customers.map((c) => generateBillForCustomer(c.id, parsed.data.month, parsed.data.year))
  );
  return res.json({ bills, count: bills.length });
});

router.get('/:customerId', async (req: AuthRequest, res) => {
  const bills = await prisma.bill.findMany({
    where: { customerId: req.params.customerId },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  });
  return res.json({ bills });
});

router.get('/:id/detail', async (req: AuthRequest, res) => {
  const bill = await prisma.bill.findUnique({ where: { id: req.params.id } });
  if (!bill) return res.status(404).json({ error: 'Bill not found' });

  const startDate = new Date(bill.year, bill.month - 1, 1);
  const endDate = new Date(bill.year, bill.month, 0);

  const deliveries = await prisma.delivery.findMany({
    where: {
      customerId: bill.customerId,
      date: { gte: startDate, lte: endDate },
    },
    orderBy: { date: 'asc' },
  });

  return res.json({ bill, deliveries });
});

export { generateBillForCustomer };
export default router;
