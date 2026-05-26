import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import authRoutes from './routes/auth';
import vendorRoutes from './routes/vendors';
import customerRoutes from './routes/customers';
import productRoutes from './routes/products';
import deliveryRoutes from './routes/deliveries';
import scheduleRoutes from './routes/schedules';
import paymentRoutes from './routes/payments';
import billRoutes from './routes/bills';
import subscriptionRoutes from './routes/subscriptions';
import reviewRoutes from './routes/reviews';
import notificationRoutes from './routes/notifications';
import { startScheduledJobs } from './jobs/scheduler';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));

// Raw body needed for Razorpay webhook signature verification
app.use('/api/payments/razorpay-webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/products', productRoutes);
app.use('/api/deliveries', deliveryRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/notifications', notificationRoutes);

app.listen(PORT, () => {
  console.log(`MilkMate API running on port ${PORT}`);
  startScheduledJobs();
});

export default app;
