import { Redis } from '@upstash/redis';
import axios from 'axios';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  const { orderId } = req.query;

  if (!orderId) {
    return res.status(400).json({ error: 'Order ID tidak ada' });
  }

  try {
    const rawData = await redis.get(orderId);
    if (!rawData) {
      return res.status(404).json({ error: 'Pesanan tidak ditemukan atau expired' });
    }

    const order = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;

    // Jika pembayaran selesai & akun belum dibuatkan ke API Dinns
    if (order.status === 'PAID' && !order.credentials) {
      try {
        // Panggil endpoint API pembuatan akun sesuai doc https://id.dinns.my.id/api/doc
        const dinnsRes = await axios.post('https://id.dinns.my.id/api/create-account', {
          username: order.username,
          protocol: order.protocol,
          exp_days: order.days
        }, {
          headers: {
            'Authorization': `Bearer ${process.env.DINNS_API_KEY || ''}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });

        order.credentials = dinnsRes.data;
        // Simpan hasil config selama 24 jam di Redis
        await redis.set(orderId, JSON.stringify(order), { ex: 86400 });
      } catch (err) {
        console.error('Error saat menghubungi API Dinns:', err.response?.data || err.message);
        order.credentials = 'Akun gagal di-generate otomatis. Silakan hubungi admin dengan Order ID Anda.';
      }
    }

    return res.status(200).json({
      status: order.status,
      credentials: order.credentials
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server Error' });
  }
}
