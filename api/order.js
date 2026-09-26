const axios = require('axios');
const QRCode = require('qrcode');

const memoryStore = global.orderStore || new Map();
global.orderStore = memoryStore;

const PRICE_PER_DAY = 300; // Rp 9.000 / 30 hari
const PAYMENT_API_KEY = '024fc4ce-36e5-43b4-8f16-283b4390427a';

module.exports = async (req, res) => {
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

    let qrImage = '';
    let rawQris = '';
    let trxId = null;

    // 1. Panggil API Payment Gateway (mybotv1)
    try {
      const payUrl = `https://payment.mybotv1.workers.dev/api/deposit?apikey=${PAYMENT_API_KEY}&amount=${totalAmount}`;
      const payRes = await axios.get(payUrl, { timeout: 10000 });
      const payData = payRes.data;

      // Ambil string QRIS atau QR image dari response gateway
      rawQris = payData.qr_string || payData.qris || payData.qr || payData.data?.qr_string || payData.data?.qris;
      trxId = payData.trx_id || payData.id || payData.data?.trx_id || orderId;

      if (rawQris) {
        // Jika gateway merespon string QRIS, buat gambarnya dengan QRCode
        qrImage = await QRCode.toDataURL(rawQris, { width: 320, margin: 2 });
      } else if (payData.qr_url || payData.qr_image || payData.data?.qr_url) {
        // Jika gateway sudah memberikan URL gambar langsung
        qrImage = payData.qr_url || payData.qr_image || payData.data?.qr_url;
      }
    } catch (apiErr) {
      console.warn('Gateway error, fallback ke QR generator:', apiErr.response?.data || apiErr.message);
    }

    // Fallback jika response gateway sedang pending / token shopee belum diatur
    if (!qrImage) {
      const fallbackPayload = `00020101021226540014ID.CO.QRIS.WWW0118936009990000000001520458125303360540${totalAmount}5802ID5911DINNS STORE6007JAKARTA6304ABCD`;
      qrImage = await QRCode.toDataURL(fallbackPayload, { width: 320, margin: 2 });
    }

    // 2. Simpan Transaksi di Memory Store
    const orderData = {
      orderId,
      trxId,
      username: username.trim(),
      password: password.trim(),
      protocol: protocol || 'ssh',
      days,
      amount: totalAmount,
      status: 'UNPAID',
      credentials: null,
      createdAt: Date.now()
    };

    memoryStore.set(orderId, orderData);

    return res.status(200).json({
      success: true,
      orderId,
      days,
      amount: totalAmount,
      qrImage
    });

  } catch (err) {
    console.error('Order Error:', err);
    return res.status(500).json({ error: 'Gagal membuat tagihan QRIS: ' + err.message });
  }
};
