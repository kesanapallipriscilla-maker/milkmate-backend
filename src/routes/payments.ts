import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import prisma from '../lib/prisma';
import { verifyFirebaseToken, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

// Razorpay webhook — raw body, no auth middleware
router.post('/razorpay-webhook', async (req, res) => {
  const signature = req.headers['x-razorpay-signature'] as string;
  const expectedSig = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(req.body)
    .digest('hex');

  if (signature !== expectedSig) return res.status(400).json({ error: 'Invalid signature' });

  const event = JSON.parse(req.body.toString());
  if (event.event === 'payment.captured') {
    const payment = event.payload.payment.entity;
    await prisma.payment.updateMany({
      where: { razorpayOrderId: payment.order_id },
      data: {
        reference: payment.id,
        status: 'SUCCESS',
        date: new Date(payment.created_at * 1000),
      },
    });
  }
  return res.json({ status: 'ok' });
});

router.use(verifyFirebaseToken);

router.post('/create-order', requireRole('CUSTOMER'), async (req: AuthRequest, res) => {
  const { billId } = req.body;
  if (!billId) return res.status(400).json({ error: 'billId is required' });

  const bill = await prisma.bill.findFirst({
    where: { id: billId, customer: { userId: req.user!.id } },
  });
  if (!bill) return res.status(404).json({ error: 'Bill not found' });

  const order = await razorpay.orders.create({
    amount: Math.round(bill.totalAmount * 100),
    currency: 'INR',
    receipt: bill.id,
  });

  const payment = await prisma.payment.create({
    data: {
      customerId: bill.customerId,
      amount: bill.totalAmount,
      mode: 'UPI',
      razorpayOrderId: order.id,
      status: 'PENDING',
    },
  });

  return res.json({ order, payment });
});

const verifySchema = z.object({
  razorpayOrderId: z.string(),
  razorpayPaymentId: z.string(),
  razorpaySignature: z.string(),
});

router.post('/verify', requireRole('CUSTOMER'), async (req: AuthRequest, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = parsed.data;
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');

  if (expected !== razorpaySignature) {
    return res.status(400).json({ error: 'Payment verification failed' });
  }

  const payment = await prisma.payment.updateMany({
    where: { razorpayOrderId },
    data: { reference: razorpayPaymentId, status: 'SUCCESS', date: new Date() },
  });

  return res.json({ message: 'Payment verified', payment });
});

const cashSchema = z.object({
  customerId: z.string(),
  amount: z.number().positive(),
});

router.post('/record-cash', requireRole('VENDOR'), async (req: AuthRequest, res) => {
  const parsed = cashSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const vendor = await prisma.vendor.findUnique({ where: { userId: req.user!.id } });
  const customer = await prisma.customer.findFirst({
    where: { id: parsed.data.customerId, vendorId: vendor?.id },
  });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const payment = await prisma.payment.create({
    data: {
      customerId: parsed.data.customerId,
      amount: parsed.data.amount,
      mode: 'CASH',
      status: 'SUCCESS',
      date: new Date(),
    },
  });
  return res.status(201).json({ payment });
});

router.get('/history/:customerId', requireRole('VENDOR'), async (req: AuthRequest, res) => {
  const vendor = await prisma.vendor.findUnique({ where: { userId: req.user!.id } });
  const customer = await prisma.customer.findFirst({
    where: { id: req.params.customerId, vendorId: vendor?.id },
  });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const payments = await prisma.payment.findMany({
    where: { customerId: req.params.customerId },
    orderBy: { createdAt: 'desc' },
  });
  return res.json({ payments });
});

export default router;
