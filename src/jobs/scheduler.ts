import cron from 'node-cron';
import prisma from '../lib/prisma';
import { generateBillForCustomer } from '../routes/bills';
import { sendPushNotification } from '../services/notification';

export function startScheduledJobs() {
  // Daily 6 AM: create PENDING delivery records for all active scheduled customers
  cron.schedule('0 6 * * *', async () => {
    console.log('[cron] Creating daily delivery records');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayOfWeek = today.getDay();

    const schedules = await prisma.deliverySchedule.findMany({
      where: { customer: { isActive: true }, daysOfWeek: { has: dayOfWeek } },
    });

    await Promise.all(
      schedules.map((s) =>
        prisma.delivery.upsert({
          where: { customerId_date: { customerId: s.customerId, date: today } },
          update: {},
          create: {
            customerId: s.customerId,
            date: today,
            status: 'PENDING',
            quantity: s.quantityLitres,
          },
        })
      )
    );
    console.log(`[cron] Created ${schedules.length} delivery records`);
  });

  // Monthly on 1st at 2 AM: auto-generate bills for previous month
  cron.schedule('0 2 1 * *', async () => {
    console.log('[cron] Generating monthly bills');
    const now = new Date();
    const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
    const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

    const customers = await prisma.customer.findMany({ where: { isActive: true } });
    await Promise.all(customers.map((c) => generateBillForCustomer(c.id, prevMonth, year)));
    console.log(`[cron] Generated bills for ${customers.length} customers`);
  });

  // Weekly Sunday 9 AM: dues reminder
  cron.schedule('0 9 * * 0', async () => {
    console.log('[cron] Sending dues reminders');
    const unpaidBills = await prisma.bill.findMany({
      where: { isPaid: false },
      include: { customer: true },
      distinct: ['customerId'],
    });

    await Promise.all(
      unpaidBills.map(async (bill) => {
        if (bill.customer.userId) {
          await sendPushNotification(
            bill.customer.userId,
            'Pending Payment',
            `You have unpaid milk bills. Please clear your dues.`,
            { type: 'dues_reminder' }
          );
        }
      })
    );
    console.log(`[cron] Sent reminders to ${unpaidBills.length} customers`);
  });
}
