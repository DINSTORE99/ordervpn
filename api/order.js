import QRCode from 'qrcode';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const PRICE_PER_DAY = 300; // Rp 9.000 / 30 hari

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  let { username, protocol, days } = req.body;

  if (!username || !username.trim()) {
    return res.status(400).json({ error: 'Username wajib diisi!' });
  }

  // Validasi batas hari: minimal 1 hari, maksimal 30 hari
  days = parseInt(days, 10);
  if (isNaN(days) || days < 1) days = 1;
  if (days > 30) days = 30;

  const totalAmount = days * PRICE_PER_DAY;
  const orderId = `INV-${Date.now()}`;

  try {
    // String payload QRIS (dapat disambungkan ke Payment Gateway seperti Pakasir, Tripay, atau Tokopay)
    const rawQris = `00020101021226540014ID.CO.QRIS.WWW0118936009990000000001520458125303360540${totalAmount}5802ID5911DINNS STORE6007JAKARTA6304ABCD`;

    // Generate base64 gambar QR code
    const qrImage = await QRCode.toDataURL(rawQris, {
      width: 320,
      margin: 2
    });

    const orderPayload = {
      orderId,
      username: username.trim(),
      protocol: protocol || 'vmess',
      days,
      price: totalAmount,
      status: 'UNPAID', // Status awal
      credentials: null
    };

    // Simpan ke Redis selama 1 jam (3600 detik)
    await redis.set(orderId, JSON.stringify(orderPayload), { ex: 3600 });

    return res.status(200).json({
      success: true,
      orderId,
      days,
      amount: totalAmount,
      qrImage
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Gagal membuat QRIS.' });
  }
}
