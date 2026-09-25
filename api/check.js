import { createTrialAccount } from './dinns.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { username, protocol } = req.body || {};
  const cleanUser = (username || '').trim();
  const selectedProto = protocol || 'vmess';

  if (!cleanUser) {
    return res.status(400).json({ error: 'Username wajib diisi!' });
  }

  try {
    // Panggil fungsi dari dinns.js
    const result = await createTrialAccount(cleanUser, selectedProto);
    return res.status(200).json({ success: true, credentials: result });

  } catch (err) {
    const errorDetail = err.response?.data || err.message;
    console.error('Error Trial Dinns:', errorDetail);

    // Kirim pesan error asli dari server Dinns ke layar user
    return res.status(500).json({ 
      error: typeof errorDetail === 'object' ? JSON.stringify(errorDetail) : errorDetail 
    });
  }
}
