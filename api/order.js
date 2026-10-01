const axios = require('axios');
const QRCode = require('qrcode');

const memoryStore = global.orderStore || new Map();
global.orderStore = memoryStore;

// ==========================================
// ⚙️ KONFIGURASI BOT TELEGRAM & DINNS
// ==========================================
const TELEGRAM_BOT_TOKEN = 'MASUKKAN_BOT_TOKEN_DISINI';
const TELEGRAM_CHAT_ID   = 'MASUKKAN_CHAT_ID_DISINI';

const DINNS_AUTH_KEY  = 'pl67k9xp37';
const PRICE_PER_DAY   = 300; // Rp 300 per hari (Rp 9.000 / 30 hari)

// URL API Gateway DinnPay
const DINNPAY_CREATE_URL = 'https://dinnpay.vercel.app/api/qris/create';

// Fungsi Kirim Notifikasi Telegram
async function sendTelegramNotification(text) {
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN.includes('MASUKKAN')) {
    return;
  }
  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: TELEGRAM_CHAT_ID,
        text: text
      },
      { timeout: 5000 }
    );
  } catch (err) {
    console.warn('Gagal mengirim notifikasi Telegram:', err.message);
  }
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

    const isRenew = actionType === 'renew';
    const proto = protocol || 'ssh';

    // Password wajib diisi jika mode pembelian akun baru
    if (!isRenew && (!password || !password.trim())) {
      return res.status(400).json({ error: 'Password wajib diisi untuk akun baru!' });
    }

    days = parseInt(days, 10);
    if (isNaN(days) || days < 1) days = 1;
    if (days > 30) days = 30;

    // ==============================================================
    // 🔍 1. VALIDASI RENEW KE SERVER DINNS SEBELUM MEMBUAT QRIS
    // ==============================================================
    if (isRenew) {
      const renewEndpoints = {
        ssh: 'rensh',
        vmess: 'renws',
        vless: 'renvl',
        trojan: 'rentr'
      };
      const endpoint = renewEndpoints[proto] || 'rensh';
      const checkUrl = `https://id.dinns.my.id/api/${endpoint}?auth=${DINNS_AUTH_KEY}&num=${encodeURIComponent(username.trim())}&exp=0`;

      try {
        const testRes = await axios.get(checkUrl, {
          headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
          timeout: 7000
        });
        const resData = testRes.data;

        const errMsg = String(resData?.message || resData?.error || '').toLowerCase();
        const isNotFound = 
          resData?.status === 'failed' || 
          resData?.status === 'error' ||
          errMsg.includes('not found') ||
          errMsg.includes('pattern ###') ||
          errMsg.includes('tidak');

        if (isNotFound) {
          return res.status(400).json({
            error: `Akun "${username}" tidak terdaftar di server Dinns! Pastikan username dan protokol benar.`
          });
        }
      } catch (err) {
        const errMsg = String(err.response?.data?.message || err.message || '').toLowerCase();
        if (
          err.response?.status === 404 || 
          errMsg.includes('not found') || 
          errMsg.includes('pattern ###') ||
          errMsg.includes('failed')
        ) {
          return res.status(400).json({
            error: `Akun "${username}" tidak terdaftar di server Dinns!`
          });
        }
      }
    }

    // ==============================================================
    // 💳 2. REQUEST QRIS KE DINNPAY GATEWAY
    // ==============================================================
    const baseAmount = days * PRICE_PER_DAY;
    const orderId = `INV-${Date.now()}`;

    let qrImage = '';
    let trxId = orderId;
    let finalPayAmount = baseAmount;

    try {
      const payRes = await axios.post(
        DINNPAY_CREATE_URL,
        {
          amount: baseAmount,
          description: `${isRenew ? 'Renew' : 'Buy'} ${proto.toUpperCase()} - ${username.trim()}`,
          testMode: false
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000
        }
      );

      const payData = payRes.data;

      if (payData.success && payData.data) {
        // Ambil URL gambar QR dan total amount (beserta kode unik jika ada)
        qrImage = payData.data.qr_url;
        trxId = payData.data.transaction_id || orderId;
        finalPayAmount = payData.data.total_amount || baseAmount;
      } else {
        throw new Error(payData.message || 'Gagal generate QR dari DinnPay');
      }
    } catch (apiErr) {
      console.warn('DinnPay Gateway error, memakai fallback QR:', apiErr.message);

      // Fallback generate QR manual jika gateway offline
      const fallbackPayload = `00020101021226540014ID.CO.QRIS.WWW0118936009990000000001520458125303360540${baseAmount}5802ID5911DINNS STORE6007JAKARTA6304ABCD`;
      qrImage = await QRCode.toDataURL(fallbackPayload, { width: 350, margin: 2 });
    }

    // ==============================================================
    // 💾 3. SIMPAN ORDER KE MEMORY STORE
    // ==============================================================
    const orderData = {
      orderId,
      trxId,
      username: username.trim(),
      password: (password || '').trim(),
      protocol: proto,
      days,
      amount: finalPayAmount,
      actionType: isRenew ? 'renew' : 'buy',
      status: 'UNPAID',
      credentials: null,
      createdAt: Date.now()
    };

    memoryStore.set(orderId, orderData);

    // ==============================================================
    // 📢 4. KIRIM NOTIFIKASI KE BOT TELEGRAM ADMIN
    // ==============================================================
    const notifText = 
`🔔 TAGIHAN QRIS DIBUAT (DINNPAY)
━━━━━━━━━━━━━━━━━━━
Jenis      : ${isRenew ? '🔄 PERPANJANG (RENEW)' : '💳 BELI BARU'}
Invoice    : ${orderId}
Trx ID     : ${trxId}
Username   : ${orderData.username}
Layanan    : ${orderData.protocol.toUpperCase()}
Durasi     : ${orderData.days} Hari
Total Bayar: Rp ${finalPayAmount.toLocaleString('id-ID')}
Status     : Menunggu Pembayaran
━━━━━━━━━━━━━━━━━━━`;

    await sendTelegramNotification(notifText);

    return res.status(200).json({
      success: true,
      orderId,
      trxId,
      days,
      amount: finalPayAmount,
      qrImage
    });

  } catch (err) {
    console.error('Order error:', err);
    return res.status(500).json({ error: 'Gagal membuat tagihan: ' + err.message });
  }
};
