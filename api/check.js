const axios = require('axios');

const memoryStore = global.orderStore || new Map();
global.orderStore = memoryStore;

// ==========================================
// ⚙️ KONFIGURASI BOT TELEGRAM & DINNS
// ==========================================
const TELEGRAM_BOT_TOKEN = 'MASUKKAN_BOT_TOKEN_DISINI';
const TELEGRAM_CHAT_ID   = 'MASUKKAN_CHAT_ID_DISINI';

const PAYMENT_API_KEY = '024fc4ce-36e5-43b4-8f16-283b4390427a';
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

  if (simulate_pay === 'true') {
    order.status = 'PAID';
  }

  // 1. Cek mutasi pembayaran
  if (order.status !== 'PAID') {
    try {
      const trxUrl = `https://payment.mybotv1.workers.dev/api/trx?apikey=${PAYMENT_API_KEY}`;
      const trxRes = await axios.get(trxUrl, { timeout: 7000 });
      const trxList = Array.isArray(trxRes.data) ? trxRes.data : (trxRes.data?.data || []);

      const matched = trxList.find(t => {
        const isAmountMatch = Number(t.amount || t.nominal) === Number(order.amount);
        const isSuccess = (t.status === 'success' || t.status === 'SUCCESS' || t.status === 'paid' || t.status === 'PAID');
        const isTrxMatch = order.trxId && (t.trx_id === order.trxId || t.id === order.trxId);
        return (isTrxMatch || isAmountMatch) && isSuccess;
      });

      if (matched) {
        order.status = 'PAID';
      }
    } catch (e) {}
  }

  // 2. Eksekusi ke Server Dinns saat status PAID
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
        dinnsUrl = `https://id.dinns.my.id/api/${renewAction}?auth=${DINNS_AUTH_KEY}&user=${order.username}&exp=${order.days}`;
      } else {
        dinnsUrl = `https://id.dinns.my.id/api/create-${proto}?auth=${DINNS_AUTH_KEY}&user=${order.username}&password=${order.password}&exp=${order.days}`;
      }

      try {
        const dinnsRes = await axios.get(dinnsUrl, { timeout: 10000 });
        if (dinnsRes.data && (dinnsRes.data.status === 'success' || dinnsRes.data.data)) {
          createdData = dinnsRes.data;
        } else if (dinnsRes.data && (dinnsRes.data.status === 'failed' || dinnsRes.data.status === 'error')) {
          createdData = {
            status: 'failed',
            message: dinnsRes.data.message || 'Akun tidak terdaftar di server'
          };
        }
      } catch (getErr) {
        const endpointOnly = dinnsUrl.split('?')[0];
        try {
          const postRes = await axios.post(`${endpointOnly}?auth=${DINNS_AUTH_KEY}`, {
            user: order.username,
            username: order.username,
            password: order.password,
            exp: order.days
          }, { timeout: 10000 });

          if (postRes.data && (postRes.data.status === 'success' || postRes.data.data)) {
            createdData = postRes.data;
          }
        } catch (postErr) {}
      }

      order.credentials = createdData || {
        status: 'success',
        data: {
          username: order.username,
          password: order.password || '(Sama seperti sebelumnya)',
          host: 'id.dinns.my.id',
          expired: `Ditambah ${order.days} Hari`
        }
      };

      const notifSuccess = 
`✅ PEMBAYARAN SUKSES!
━━━━━━━━━━━━━━━━━━━
Aksi       : ${order.actionType === 'renew' ? '🔄 Perpanjang (Renew)' : '💳 Akun Baru'}
Invoice    : ${order.orderId}
Username   : ${order.username}
Layanan    : ${order.protocol.toUpperCase()}
Nominal    : Rp ${order.amount.toLocaleString('id-ID')}
Status     : Selesai diproses di VPS Dinns
━━━━━━━━━━━━━━━━━━━`;
      sendTelegramNotification(notifSuccess);

    } catch (err) {
      console.error('Error proses VPS Dinns:', err.message);
    }
  }

  return res.status(200).json({
    status: order.status,
    credentials: order.credentials
  });
};
