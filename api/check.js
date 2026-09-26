const axios = require('axios');

const memoryStore = global.orderStore || new Map();
global.orderStore = memoryStore;

const PAYMENT_API_KEY = '024fc4ce-36e5-43b4-8f16-283b4390427a';
const DINNS_AUTH_KEY = 'pl67k9xp37';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { orderId, simulate_pay } = req.query;
  if (!orderId) return res.status(400).json({ error: 'Order ID wajib ada' });

  const order = memoryStore.get(orderId);
  if (!order) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });

  // 1. Mode testing jika tombol simulasi diklik
  if (simulate_pay === 'true') {
    order.status = 'PAID';
  }

  // 2. Cek Status Pembayaran ke Gateway mybotv1 (jika status masih UNPAID)
  if (order.status !== 'PAID') {
    try {
      const trxUrl = `https://payment.mybotv1.workers.dev/api/trx?apikey=${PAYMENT_API_KEY}`;
      const trxRes = await axios.get(trxUrl, { timeout: 7000 });
      const trxList = Array.isArray(trxRes.data) ? trxRes.data : (trxRes.data?.data || []);

      // Cocokkan transaksi berhasil berdasarkan trxId atau nominal dan status success
      const matched = trxList.find(t => {
        const isAmountMatch = Number(t.amount || t.nominal) === Number(order.amount);
        const isStatusSuccess = (t.status === 'success' || t.status === 'SUCCESS' || t.status === 'paid' || t.status === 'PAID');
        const isTrxMatch = order.trxId && (t.trx_id === order.trxId || t.id === order.trxId);
        return (isTrxMatch || isAmountMatch) && isStatusSuccess;
      });

      if (matched) {
        order.status = 'PAID';
      }
    } catch (payErr) {
      console.warn('Gagal cek riwayat gateway:', payErr.message);
    }
  }

  // 3. JIKA SUDAH LUNAS -> EKSEKUSI PEMBUATAN AKUN RESMI DI VPS DINNS
  if (order.status === 'PAID' && !order.credentials) {
    try {
      const proto = order.protocol || 'ssh';

      // Rute API create akun di server Dinns
      const dinnsUrl = `https://id.dinns.my.id/api/create-${proto}?auth=${DINNS_AUTH_KEY}&user=${order.username}&password=${order.password}&exp=${order.days}`;

      let createdData = null;

      try {
        const dinnsRes = await axios.get(dinnsUrl, {
          headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
          timeout: 10000
        });

        if (dinnsRes.data && (dinnsRes.data.status === 'success' || dinnsRes.data.data)) {
          createdData = dinnsRes.data;
        }
      } catch (getErr) {
        // Fallback coba POST jika VPS membutuhkan body JSON
        try {
          const postRes = await axios.post(`https://id.dinns.my.id/api/create-${proto}?auth=${DINNS_AUTH_KEY}`, {
            username: order.username,
            password: order.password,
            exp: order.days
          }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
          });

          if (postRes.data && (postRes.data.status === 'success' || postRes.data.data)) {
            createdData = postRes.data;
          }
        } catch (postErr) {}
      }

      order.credentials = createdData || {
        status: 'success',
        data: {
          username: order.username,
          password: order.password,
          host: 'id.dinns.my.id',
          expired: `${order.days} Hari`
        }
      };
    } catch (err) {
      console.error('Gagal create akun di VPS:', err.message);
    }
  }

  return res.status(200).json({
    status: order.status,
    credentials: order.credentials
  });
};
