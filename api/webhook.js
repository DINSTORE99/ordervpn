import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { orderId, status } = req.body;

    if (orderId && status === 'PAID') {
      const rawData = await redis.get(orderId);
      if (rawData) {
        const order = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
        order.status = 'PAID';
        await redis.set(orderId, JSON.stringify(order), { ex: 3600 });
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Webhook processing error' });
  }
}
