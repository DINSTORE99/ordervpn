import QRCode from 'qrcode';

const memoryStore = global.orderStore || new Map();
global.orderStore = memoryStore;

const PRICE_PER_DAY = 300; // Rp 9.000 / 30 hari

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    let { username, password, protocol, days } = req.body || {};

    if (!username || !username.trim()) {
      return res.status(400).json({ error: 'Username wajib diisi!' });
    }
    if (!password || !password.trim()) {
      return res.status(400).json({ error: 'Password wajib diisi!' });
    }

    days = parseInt(days, 10);
    if (isNaN(days) || days < 1) days = 1;
    if (days > 30) days = 30;

    const totalAmount = days * PRICE_PER_DAY;
    const orderId = `INV-${Date.now()}`;

    // Payload QRIS string (atau endpoint gateway pembayaran Anda)
    const qrPayload = `https://id.dinns.my.id/pay?order_id=${orderId}&amount=${totalAmount}`;

    const qrImage = await QRCode.toDataURL(qrPayload, {
      width: 300,
      margin: 2
    });

    const orderData = {
      orderId,
      username: username.trim(),
      password: password.trim(),
      protocol: protocol || 'vmess',
      days,
      amount: totalAmount,
      status: 'UNPAID',
      credentials: null
    };

    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      try {
        const { Redis } = await import('@upstash/redis');
        const redis = Redis.fromEnv();
        await redis.set(orderId, JSON.stringify(orderData), { ex: 3600 });
      } catch (e) {
        memoryStore.set(orderId, orderData);
      }
    } else {
      memoryStore.set(orderId, orderData);
    }

    return res.status(200).json({
      success: true,
      orderId,
      days,
      amount: totalAmount,
      qrImage
    });
  } catch (err) {
    return res.status(500).json({ error: 'Gagal membuat tagihan QRIS' });
  }
}
