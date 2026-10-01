const axios = require('axios');

const memoryStore = global.orderStore || new Map();
global.orderStore = memoryStore;

// ==========================================
// ⚙️ KONFIGURASI BOT TELEGRAM & DINNS
// ==========================================
const TELEGRAM_BOT_TOKEN = 'MASUKKAN_BOT_TOKEN_DISINI';
const TELEGRAM_CHAT_ID   = 'MASUKKAN_CHAT_ID_DISINI';
const DINNS_AUTH_KEY     = 'pl67k9xp37';

// Skema Harga Baru
const PRICE_30_DAYS = 10500;
const PRICE_60_DAYS = 19000; // Base 1 IP (Jika 3 IP: 19.000 + 2 * 2.500 = 24.000)
const PRICE_PER_ADDITIONAL_IP = 2500;

async function sendTelegramNotification(text) {
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN.includes('MASUKKAN')) return;
  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      { chat_id: TELEGRAM_CHAT_ID, text: text },
      { timeout: 5000 }
    );
  } catch (err) {
    console.warn('Gagal kirim notif Telegram:', err.message);
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    let { username, password, protocol, days, iplimit, actionType } = req.body || {};

    if (!username || !username.trim()) {
      return res.status(400).json({ error: 'Username wajib diisi!' });
    }

    const isRenew = actionType === 'renew';
    const proto = protocol || 'ssh';

    if (!isRenew && (!password || !password.trim())) {
      return res.status(400).json({ error: 'Password wajib diisi untuk akun baru!' });
    }

    days = parseInt(days, 10);
    if (days !== 30 && days !== 60) days = 30;

    iplimit = parseInt(iplimit, 10);
    if (isNaN(iplimit) || iplimit < 1) iplimit = 1;
    if (iplimit > 5) iplimit = 5;

    // 1. VALIDASI RENEW SEBELUM MEMBUAT QRIS
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
        const testRes = await axios.get(checkUrl, { timeout: 7000 });
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
            error: `Akun "${username}" tidak terdaftar di server Dinns!`
          });
        }
      } catch (err) {
        const errMsg = String(err.response?.data?.message || err.message || '').toLowerCase();
        if (err.response?.status === 404 || errMsg.includes('not found') || errMsg.includes('pattern ###')) {
          return res.status(400).json({
            error: `Akun "${username}" tidak terdaftar di server Dinns!`
          });
        }
      }
    }

    // 2. HITUNG TOTAL HARGA BERDASARKAN DURASI & LIMIT IP
    let basePrice = (days === 60) ? PRICE_60_DAYS : PRICE_30_DAYS;
    let extraIpPrice = (iplimit - 1) * PRICE_PER_ADDITIONAL_IP;
    let totalBaseAmount = basePrice + extraIpPrice;

    const orderId = `INV-${Date.now()}`;

    // 3. REQUEST BUAT QRIS KE DINNPAY
    let transactionId = null;
    let qrImageUrl = '';
    let totalPayAmount = totalBaseAmount;
    let feeAmount = 0;

    try {
      const dinnPayRes = await axios.post('https://dinnpay.vercel.app/api/qris/create', {
        amount: totalBaseAmount,
        description: `Order ${orderId} - ${username} (${days}H/${iplimit}IP)`,
        testMode: false
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      const dinnData = dinnPayRes.data;
      if (dinnData && dinnData.success && dinnData.data) {
        transactionId = dinnData.data.transaction_id;
        qrImageUrl = dinnData.data.qr_url;
        totalPayAmount = Number(dinnData.data.total_amount || dinnData.data.amount || totalBaseAmount);

        if (dinnData.data.amount_uniq !== undefined) {
          feeAmount = Number(dinnData.data.amount_uniq);
        } else {
          feeAmount = Math.max(0, totalPayAmount - totalBaseAmount);
        }
      } else {
        throw new Error(dinnData?.message || 'Gagal generate QRIS dari DinnPay');
      }
    } catch (payErr) {
      console.error('DinnPay API Error:', payErr.response?.data || payErr.message);
      return res.status(500).json({ 
        error: 'Gagal membuat QRIS ke DinnPay: ' + (payErr.response?.data?.message || payErr.message) 
      });
    }

    // 4. SIMPAN DATA TRANSAKSI
    const orderData = {
      orderId,
      transactionId,
      username: username.trim(),
      password: (password || '').trim(),
      protocol: proto,
      days,
      iplimit,
      baseAmount: totalBaseAmount,
      feeAmount,
      amount: totalPayAmount,
      actionType: isRenew ? 'renew' : 'buy',
      status: 'UNPAID',
      credentials: null,
      createdAt: Date.now()
    };

    memoryStore.set(orderId, orderData);

    // 5. NOTIFIKASI TELEGRAM
    const notifText = 
`🔔 TAGIHAN QRIS BARU (DinnPay)
━━━━━━━━━━━━━━━━━━━
Jenis       : ${isRenew ? '🔄 PERPANJANG (RENEW)' : '💳 BELI BARU'}
Invoice     : ${orderId}
Trx ID      : ${transactionId}
Username    : ${orderData.username}
Layanan     : ${orderData.protocol.toUpperCase()}
Durasi      : ${orderData.days} Hari
Limit IP    : ${orderData.iplimit} IP Device
Harga Paket : Rp ${totalBaseAmount.toLocaleString('id-ID')}
Fee / Unik  : Rp ${feeAmount.toLocaleString('id-ID')}
Total Bayar : Rp ${totalPayAmount.toLocaleString('id-ID')} (Wajib Pas)
Status      : Menunggu Pembayaran
━━━━━━━━━━━━━━━━━━━`;
    await sendTelegramNotification(notifText);

    return res.status(200).json({
      success: true,
      orderId,
      days,
      iplimit,
      baseAmount: totalBaseAmount,
      feeAmount,
      totalAmount: totalPayAmount,
      qrImage: qrImageUrl
    });

  } catch (err) {
    console.error('Order Error:', err);
    return res.status(500).json({ error: 'Gagal membuat tagihan: ' + err.message });
  }
};
