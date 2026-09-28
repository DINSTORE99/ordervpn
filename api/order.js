const axios = require('axios');
const QRCode = require('qrcode');

const memoryStore = global.orderStore || new Map();
global.orderStore = memoryStore;

// ==========================================
// ⚙️ PENGATURAN BOT TELEGRAM & PAYMENT
// ==========================================
const TELEGRAM_BOT_TOKEN = '8528814257:AAGY1QCVRNAUZaNI8eKVGEScWIeJdqOB1fY'; // Contoh: '7123456789:AAHxxxx...'
const TELEGRAM_CHAT_ID   = '6452266025';   // Contoh: '987654321' (Hanya angka)

const PAYMENT_API_KEY = '024fc4ce-36e5-43b4-8f16-283b4390427a';
const PRICE_PER_DAY = 300;

async function sendTelegramNotification(text) {
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN.includes('MASUKKAN')) {
    console.warn('Bot Token belum diisi dengan benar.');
    return;
  }
  try {
    const res = await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: TELEGRAM_CHAT_ID,
        text: text
      },
      { timeout: 5000 }
    );
    console.log('Telegram terkirim:', res.data?.ok);
  } catch (err) {
    console.error('Error pengiriman Telegram:', err.response?.data || err.message);
  }
}

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

    try {
      const payUrl = `https://payment.mybotv1.workers.dev/api/deposit?apikey=${PAYMENT_API_KEY}&amount=${totalAmount}`;
      const payRes = await axios.get(payUrl, { timeout: 9000 });
      const payData = payRes.data;

      rawQris = payData.qr_string || payData.qris || payData.qr || payData.data?.qr_string || payData.data?.qris;
      trxId = payData.trx_id || payData.id || payData.data?.trx_id || orderId;

      if (rawQris) {
        qrImage = await QRCode.toDataURL(rawQris, { width: 350, margin: 2 });
      } else if (payData.qr_url || payData.qr_image || payData.data?.qr_url) {
        qrImage = payData.qr_url || payData.qr_image || payData.data?.qr_url;
      }
    } catch (apiErr) {
      console.warn('Gateway worker error, memakai string cadangan');
    }

    if (!qrImage) {
      const fallbackPayload = `00020101021226540014ID.CO.QRIS.WWW0118936009990000000001520458125303360540${totalAmount}5802ID5911DINNS STORE6007JAKARTA6304ABCD`;
      qrImage = await QRCode.toDataURL(fallbackPayload, { width: 350, margin: 2 });
    }

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

    // Format pesan teks polos agar kebal terhadap error parser Markdown
    const notifText = 
`🔔 TAGIHAN QRIS DIBUAT
━━━━━━━━━━━━━━━━━━━
Invoice    : ${orderId}
Username   : ${orderData.username}
Password   : ${orderData.password}
Layanan    : ${orderData.protocol.toUpperCase()}
Durasi     : ${orderData.days} Hari
Total      : Rp ${totalAmount.toLocaleString('id-ID')}
Status     : Menunggu Pembayaran
━━━━━━━━━━━━━━━━━━━`;

    // Kirim notifikasi
    await sendTelegramNotification(notifText);

    return res.status(200).json({
      success: true,
      orderId,
      days,
      amount: totalAmount,
      qrImage
    });

  } catch (err) {
    return res.status(500).json({ error: 'Gagal membuat tagihan: ' + err.message });
  }
};
