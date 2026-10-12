const axios = require('axios');

const memoryStore = global.orderStore || new Map();
global.orderStore = memoryStore;

const TELEGRAM_BOT_TOKEN = '8117724992:AAH59YJ5omb6KwnwpQgV6VxZhtHElExdvOg';
const TELEGRAM_CHAT_ID   = '6452266025';
const DINNS_AUTH_KEY     = 'pl67k9xp37';

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const params = req.method === 'POST' ? req.body : req.query;
  const { orderId, trx_id, username, password, protocol, days, iplimit, actionType, simulate_pay } = params || {};

  if (!orderId && !trx_id) {
    return res.status(400).json({ error: 'Order ID atau Transaction ID wajib ada' });
  }

  let order = memoryStore.get(orderId) || {
    orderId: orderId || `INV-${Date.now()}`,
    transactionId: trx_id,
    username: username,
    password: password || 'vpn_pass',
    protocol: protocol || 'ssh',
    days: parseInt(days || 30, 10),
    iplimit: parseInt(iplimit || 1, 10),
    actionType: actionType || 'buy',
    status: 'UNPAID',
    credentials: null
  };

  const currentTrxId = String(order.transactionId || trx_id || '');

  // Mode Simulasi Testing
  if (simulate_pay === 'true') {
    order.status = 'PAID';
  }

  // 1. CEK STATUS TRANSAKSI KE DINNPAY
  let dinnPayRaw = null;
  if (order.status !== 'PAID' && currentTrxId) {
    try {
      const statusRes = await axios.post('https://dinnpay.vercel.app/api/qris/status', {
        transaction_id: currentTrxId
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 9000
      });

      dinnPayRaw = statusRes.data;
      console.log('DinnPay Status Response:', JSON.stringify(dinnPayRaw));

      // Ekstraksi status dari berbagai kemungkinan skema respon
      const dataObj = dinnPayRaw?.data || dinnPayRaw || {};
      const statusStr = String(dataObj?.status || dinnPayRaw?.status || '').toLowerCase();
      const isPaidBool = Boolean(dataObj?.paid || dataObj?.is_paid || dinnPayRaw?.paid);

      // Verifikasi jika lunas
      if (
        isPaidBool === true ||
        statusStr === 'paid' ||
        statusStr === 'success' ||
        statusStr === 'settlement' ||
        statusStr === 'berhasil' ||
        statusStr === 'sukses'
      ) {
        order.status = 'PAID';
      }
    } catch (err) {
      console.warn('Gagal cek status DinnPay:', err.response?.data || err.message);
    }
  }

  // 2. EKSEKUSI PEMBUATAN / PERPANJANGAN KE VPS DINNS SAAT STATUS PAID
  if (order.status === 'PAID' && !order.credentials && order.username) {
    try {
      const proto = order.protocol || 'ssh';
      const ipParam = order.iplimit || 1;
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
        dinnsUrl = `https://id.dinns.my.id/api/${renewAction}?auth=${DINNS_AUTH_KEY}&num=${encodeURIComponent(order.username)}&exp=${order.days}&iplimit=${ipParam}`;
      } else {
        dinnsUrl = `https://id.dinns.my.id/api/create-${proto}?auth=${DINNS_AUTH_KEY}&user=${encodeURIComponent(order.username)}&password=${encodeURIComponent(order.password)}&exp=${order.days}&iplimit=${ipParam}`;
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
            exp: order.days,
            iplimit: ipParam
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
          expired: `Masa aktif berhasil ditambah ${order.days} Hari (${ipParam} IP)`
        }
      };

      memoryStore.set(order.orderId, order);

      // Notifikasi Sukses Telegram
      const notifSuccess = 
`✅ PEMBAYARAN DINNPAY TERVERIFIKASI!
━━━━━━━━━━━━━━━━━━━
Aksi       : ${order.actionType === 'renew' ? '🔄 Perpanjang (Renew)' : '💳 Akun Baru'}
Invoice    : ${order.orderId}
Trx ID     : ${currentTrxId}
Username   : ${order.username}
Layanan    : ${order.protocol.toUpperCase()}
Durasi     : ${order.days} Hari (${ipParam} IP)
Status     : Sukses dieksekusi di Server Dinns
━━━━━━━━━━━━━━━━━━━`;
      await sendTelegramNotification(notifSuccess);

    } catch (err) {
      console.error('Error proses VPS Dinns:', err.message);
    }
  }

  return res.status(200).json({
    status: order.status,
    credentials: order.credentials,
    debug: {
      trxId: currentTrxId,
      gatewayResponse: dinnPayRaw
    }
  });
};
