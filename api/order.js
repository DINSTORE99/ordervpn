const axios = require('axios');
const QRCode = require('qrcode');

const memoryStore = global.orderStore || new Map();
global.orderStore = memoryStore;

// ==========================================
// ⚙️ KONFIGURASI BOT TELEGRAM & DINNS
// ==========================================
const TELEGRAM_BOT_TOKEN = 'MASUKKAN_BOT_TOKEN_DISINI';
const TELEGRAM_CHAT_ID   = 'MASUKKAN_CHAT_ID_DISINI';

const PAYMENT_API_KEY = '024fc4ce-36e5-43b4-8f16-283b4390427a';
const DINNS_AUTH_KEY  = 'pl67k9xp37';
const PRICE_PER_DAY   = 300;

async function sendTelegramNotification(text) {
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN.includes('MASUKKAN')) return;
  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      { chat_id: TELEGRAM_CHAT_ID, text: text },
      { timeout: 4000 }
    );
  } catch (err) {}
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    let { username, password, protocol, days, actionType } = req.body || {};

    if (!username || !username.trim()) {
      return res.status(400).json({ error: 'Username wajib diisi!' });
    }

    days = parseInt(days, 10);
    if (isNaN(days) || days < 1) days = 1;
    if (days > 30) days = 30;

    const isRenew = actionType === 'renew';
    const proto = protocol || 'ssh';

    // ==============================================================
    // 🔍 PENGECEKAN KHUSUS RENEW: VALIDASI KE SERVER DINNS
    // ==============================================================
    if (isRenew) {
      const renewEndpoints = {
        ssh: 'rensh',
        vmess: 'renws',
        vless: 'renvl',
        trojan: 'rentr'
      };
      const endpoint = renewEndpoints[proto] || 'rensh';
      const checkUrl = `https://id.dinns.my.id/api/${endpoint}?auth=${DINNS_AUTH_KEY}&user=${username.trim()}&exp=0`;

      try {
        const testRes = await axios.get(checkUrl, { timeout: 7000 });
        const resData = testRes.data;

        // Cek jika server mengembalikan tanda gagal / tidak terdaftar
        const isNotFound = 
          (resData && resData.status === 'failed') ||
          (resData && resData.status === 'error') ||
          (typeof resData?.message === 'string' && (
            resData.message.toLowerCase().includes('not found') ||
            resData.message.toLowerCase().includes('tidak ditemukan') ||
            resData.message.toLowerCase().includes('tidak terdaftar') ||
            resData.message.toLowerCase().includes('not exist')
          ));

        if (isNotFound) {
          return res.status(400).json({
            error: `Akun "${username}" tidak terdaftar di server Dinns! Pastikan username dan protokol benar.`
          });
        }
      } catch (err) {
        const errMsg = err.response?.data?.message || err.response?.data?.error || '';
        if (
          err.response?.status === 404 || 
          errMsg.toLowerCase().includes('not found') || 
          errMsg.toLowerCase().includes('tidak')
        ) {
          return res.status(400).json({
            error: `Akun "${username}" tidak terdaftar di server Dinns!`
          });
        }
      }
    }

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
      console.warn('Gateway worker error, memakai cadangan');
    }

    if (!qrImage) {
      const fallbackPayload = `00020101021226540014ID.CO.QRIS.WWW0118936009990000000001520458125303360540${totalAmount}5802ID5911DINNS STORE6007JAKARTA6304ABCD`;
      qrImage = await QRCode.toDataURL(fallbackPayload, { width: 350, margin: 2 });
    }

    const orderData = {
      orderId,
      trxId,
      username: username.trim(),
      password: (password || '').trim(),
      protocol: proto,
      days,
      amount: totalAmount,
      actionType: isRenew ? 'renew' : 'buy',
      status: 'UNPAID',
      credentials: null,
      createdAt: Date.now()
    };

    memoryStore.set(orderId, orderData);

    const notifText = 
`🔔 TAGIHAN QRIS DIBUAT
━━━━━━━━━━━━━━━━━━━
Jenis      : ${isRenew ? '🔄 PERPANJANG (RENEW)' : '💳 BELI BARU'}
Invoice    : ${orderId}
Username   : ${orderData.username}
Layanan    : ${orderData.protocol.toUpperCase()}
Durasi     : ${orderData.days} Hari
Total      : Rp ${totalAmount.toLocaleString('id-ID')}
Status     : Menunggu Pembayaran
━━━━━━━━━━━━━━━━━━━`;
    sendTelegramNotification(notifText);

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
