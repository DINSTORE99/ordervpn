const https = require('https');

module.exports = async (req, res) => {
  // Set CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Jika diakses lewat browser (GET) untuk tes apakah endpoint aktif
  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: 'OK', 
      message: 'Endpoint API Trial Aktif dan Siap Digunakan!' 
    });
  }

  // Generate username random untuk trial (contoh: trial_a8f2k9)
  const rand = Math.random().toString(36).substring(2, 8);
  const randomUser = `trial_${rand}`;
  const protocol = (req.body && req.body.protocol) || 'vmess';

  // Config string akun trial 60 menit
  const configOutput = 
`======================================
AKUN TRIAL BERHASIL DIBUAT (60 MENIT)
======================================
Status       : Aktif
Username     : ${randomUser}
Protokol     : ${protocol.toUpperCase()}
Masa Aktif   : 60 Menit (1 Jam)
Host/Server  : id.dinns.my.id

Link Config:
${protocol}://${Buffer.from(`${randomUser}@id.dinns.my.id:443`).toString('base64')}
======================================`;

  return res.status(200).json({
    success: true,
    username: randomUser,
    credentials: configOutput
  });
};
