import QRCode from 'qrcode';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

// Tarif: Rp 9000 / 30 hari = Rp 300 per hari
const PRICE_PER_DAY = 300; 

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  let { username, protocol, days } = req.body;

  if (!username) {
    return res.status(400).json({ error: 'Username wajib diisi' });
  }

  // Validasi & batasi hari antara 1 sampai 30 hari
  days = parseInt(days, 10);
  if (isNaN(days) || days < 1) days = 1;
  if (days > 30) days = 30;

  // Hitung total harga otomatis
  const totalAmount = days * PRICE_PER_DAY;

  try {
    const orderId = `INV-${Date.now()}`;

    // Buat QRIS string sesuai total harga
    // Ganti bagian ini jika memakai API gateway pembayaran Anda
    const rawQrisString = `00020101021226540014ID.CO.QRIS.WWW0118936009990000000001520458125303360540${totalAmount}5802ID5911DINNS STORE6007JAKARTA6304ABCD`;

    const qrImage = await QRCode.toDataURL(rawQrisString);

    // Simpan data order ke Redis
    const orderData = {
      orderId,
      username,
      protocol: protocol || 'vmess',
      price: totalAmount,
      expDays: days,
      status: 'UNPAID',
      credentials: null
    };

    await redis.set(orderId, JSON.stringify(orderData), { ex: 3600 });

    return res.status(200).json({
      success: true,
      orderId,
      amount: totalAmount,
      days: days,
      qrImage
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Gagal membuat QRIS' });
  }
}
