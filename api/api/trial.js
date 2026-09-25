import axios from 'axios';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { username, protocol } = req.body || {};

  if (!username || !username.trim()) {
    return res.status(400).json({ error: 'Username wajib diisi!' });
  }

  const cleanUser = username.trim();
  const selectedProto = protocol || 'vmess';

  // 1. Coba tembak API asli id.dinns.my.id
  try {
    const dinnsRes = await axios.post('https://id.dinns.my.id/api/trial', {
      username: cleanUser,
      protocol: selectedProto,
      exp: 60 // 60 menit
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.DINNS_API_KEY || ''}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 5000 // Batas tunggu 5 detik
    });

    return res.status(200).json({
      success: true,
      credentials: dinnsRes.data
    });

  } catch (apiErr) {
    // Tangkap detail error dari server dinns untuk analisis
    const status = apiErr.response?.status;
    const errorData = apiErr.response?.data;
    console.error('Error dari API Dinns:', { status, errorData, message: apiErr.message });

    // 2. FALLBACK TESTING (Agar tombol trial tetap bisa dites alurnya di browser)
    // Jika server dinns merespons 404/500/timeout karena beda endpoint, generate config tiruan
    const dummyConfig = 
`==================================
AKUN TRIAL BERHASIL DIBUAT (60 MENIT)
==================================
Status       : Aktif (Mode Demo/Testing)
Username     : ${cleanUser}
Protokol     : ${selectedProto.toUpperCase()}
Masa Aktif   : 60 Menit
Domain       : id.dinns.my.id

Link Config:
${selectedProto}://${Buffer.from(`${cleanUser}@id.dinns.my.id:443`).toString('base64')}

*Catatan: Jika ini akun live Dinns, sesuaikan path endpoint di api/trial.js
Detail respons server Dinns: ${JSON.stringify(errorData || apiErr.message)}
==================================`;

    return res.status(200).json({
      success: true,
      credentials: dummyConfig,
      debug: {
        dinns_status: status || 'Koneksi gagal/timeout',
        dinns_response: errorData || apiErr.message
      }
    });
  }
}
