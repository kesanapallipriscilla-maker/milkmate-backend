import { messaging } from '../lib/firebase';
import prisma from '../lib/prisma';

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>
) {
  const tokens = await prisma.fcmToken.findMany({ where: { userId } });
  if (!tokens.length) return;

  await prisma.notification.create({
    data: { userId, title, body, type: data?.type ?? 'general' },
  });

  const tokenValues = tokens.map((t) => t.token);
  try {
    await messaging.sendEachForMulticast({
      tokens: tokenValues,
      notification: { title, body },
      data,
    });
  } catch (err) {
    console.error('FCM send error:', err);
  }
}
