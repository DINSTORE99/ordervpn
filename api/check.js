import { createOfficialAccount } from './dinns.js';

const memoryStore = global.orderStore || new Map();
global.orderStore = memoryStore;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { orderId } = req.query;
  if (!orderId) return res.status(400).json({ error: 'Order ID wajib disertakan' });

  try {
    let order = null;

    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      try {
        const { Redis } = await import('@upstash/redis');
        const redis = Redis.fromEnv();
        const raw = await redis.get(orderId);
        order = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch (e) {
        order = memoryStore.get(orderId);
      }
    } else {
      order = memoryStore.get(orderId);
    }

    if (!order) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });

    // Jika sudah lunas dan belum dibuatkan akun
    if (order.status === 'PAID' && !order.credentials) {
      try {
        order.credentials = await createOfficialAccount(
          order.username,
          order.password,
          order.protocol,
          order.days
        );
      } catch (err) {
        order.credentials = 'Gagal generate akun Dinns: ' + (err.response?.data?.message || err.message);
      }
    }

    return res.status(200).json({
      status: order.status,
      credentials: order.credentials
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
