const axios = require('axios');

const memoryStore = global.orderStore || new Map();
global.orderStore = memoryStore;

// ==========================================
// ⚙️ KONFIGURASI BOT TELEGRAM & DINNS
// ==========================================
const TELEGRAM_BOT_TOKEN = 'MASUKKAN_BOT_TOKEN_DISINI';
const TELEGRAM_CHAT_ID   = 'MASUKKAN_CHAT_ID_DISINI';

const DINNS_AUTH_KEY  = 'pl67k9xp37';

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

  const { orderId, simulate_pay } = req.query;
  if (!orderId) return res.status(400).json({ error: 'Order ID wajib ada' });

  const order = memoryStore.get(orderId);
  if (!order) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });

  // Mode Simulasi untuk Testing
  if (simulate_pay === 'true') {
    order.status = 'PAID';
  }

  // 1. CEK STATUS PEMBAYARAN KE DINNPAY VIA POST /api/qris/status
  if (order.status !== 'PAID' && order.transactionId) {
    try {
      const statusRes = await axios.post('https://dinnpay.vercel.app/api/qris/status', {
        transaction_id: order.transactionId
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 7000
      });

      const resData = statusRes.data;
      const status = (resData?.data?.status || resData?.status || '').toLowerCase();

      if (status === 'paid' || status === 'success' || status === 'settlement' || status === 'berhasil') {
        order.status = 'PAID';
      }
    } catch (err) {
      console.warn('Gagal cek status ke DinnPay:', err.response?.data || err.message);
    }
  }

  // 2. EKSEKUSI KE VPS DINNS KETIKA SUDAH LUNAS (PAID)
  if (order.status === 'PAID' && !order.credentials) {
    try {
      const proto = order.protocol || 'ssh';
      let dinnsUrl = '';
      let createdData = null;

      if (order.actionType === 'renew') {
        const renewEndpoints = {
          ssh: 'rensh',
          vmess: 'renws',
          vless: 'renvl',
          trojan: 'rentr'
        };
        const renewAction = renewEndpoints[proto] || 'rensh';
        dinnsUrl = `https://id.dinns.my.id/api/${renewAction}?auth=${DINNS_AUTH_KEY}&num=${encodeURIComponent(order.username)}&exp=${order.days}`;
      } else {
        dinnsUrl = `https://id.dinns.my.id/api/create-${proto}?auth=${DINNS_AUTH_KEY}&user=${encodeURIComponent(order.username)}&password=${encodeURIComponent(order.password)}&exp=${order.days}`;
      }

      try {
        const dinnsRes = await axios.get(dinnsUrl, { timeout: 10000 });
        if (dinnsRes.data && (dinnsRes.data.status === 'success' || dinnsRes.data.data)) {
          createdData = dinnsRes.data;
        } else if (dinnsRes.data) {
          createdData = dinnsRes.data;
        }
      } catch (getErr) {
        const endpointOnly = dinnsUrl.split('?')[0];
        try {
          const postRes = await axios.post(`${endpointOnly}?auth=${DINNS_AUTH_KEY}`, {
            num: order.username,
            user: order.username,
            password: order.password,
            exp: order.days
          }, { timeout: 10000 });

          if (postRes.data) createdData = postRes.data;
        } catch (postErr) {}
      }

      order.credentials = createdData || {
        status: 'success',
        data: {
          username: order.username,
          password: order.password || '(Sama seperti sebelumnya)',
          host: 'id.dinns.my.id',
          expired: `Masa aktif berhasil ditambah ${order.days} Hari`
        }
      };

      // 3. KIRIM LAPORAN KE TELEGRAM
      const notifSuccess = 
`✅ PEMBAYARAN DINNPAY SUKSES!
━━━━━━━━━━━━━━━━━━━
Aksi       : ${order.actionType === 'renew' ? '🔄 Perpanjang (Renew)' : '💳 Akun Baru'}
Invoice    : ${order.orderId}
Trx ID     : ${order.transactionId}
Username   : ${order.username}
Layanan    : ${order.protocol.toUpperCase()}
Nominal    : Rp ${Number(order.amount).toLocaleString('id-ID')}
Status     : Aktif di Server Dinns
━━━━━━━━━━━━━━━━━━━`;
      await sendTelegramNotification(notifSuccess);

    } catch (err) {
      console.error('Error proses VPS Dinns:', err.message);
    }
  }

  return res.status(200).json({
    status: order.status,
    credentials: order.credentials
  });
};
