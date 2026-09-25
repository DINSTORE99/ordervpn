import axios from 'axios';

// Batasi rate-limit klaim per IP (1 kali klaim setiap 2 jam)
const trialLogs = global.trialLogs || new Map();
global.trialLogs = trialLogs;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { username, protocol } = req.body || {};
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

    if (!username || !username.trim()) {
      return res.status(400).json({ error: 'Username wajib diisi!' });
    }

    // Cooldown IP: 2 Jam (120 menit) agar tidak spam trial
    const lastClaim = trialLogs.get(clientIp);
    const now = Date.now();
    const cooldownTime = 2 * 60 * 60 * 1000;

    if (lastClaim && now - lastClaim < cooldownTime) {
      const remainingMinutes = Math.ceil((cooldownTime - (now - lastClaim)) / (60 * 1000));
      return res.status(429).json({ 
        error: `Anda sudah pernah klaim trial 60 menit. Coba lagi dalam ${remainingMinutes} menit atau beli paket resmi.` 
      });
    }

    // Panggil API dinns untuk membuat akun trial 60 Menit
    try {
      const dinnsRes = await axios.post('https://id.dinns.my.id/api/create-account', {
        username: username.trim(),
        protocol: protocol || 'vmess',
        exp_minutes: 60, // 60 menit trial
        exp_hours: 1,    // alternatif format jam jika API membutuhkan jam
        is_trial: true
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.DINNS_API_KEY || ''}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      trialLogs.set(clientIp, now);

      return res.status(200).json({
        success: true,
        credentials: dinnsRes.data
      });
    } catch (apiErr) {
      console.error('API Dinns Error:', apiErr.response?.data || apiErr.message);
      return res.status(502).json({
        error: apiErr.response?.data?.message || 'Gagal generate akun trial di server Dinns. Pastikan API Dinns aktif.'
      });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
