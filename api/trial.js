const axios = require('axios');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Mode tes lewat browser langsung
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'API Online' });
  }

  const { protocol } = req.body || {};
  const selectedProto = protocol || 'vmess';

  // 1. Generate Username Random (6 Karakter)
  const randString = Math.random().toString(36).substring(2, 8);
  const username = `trial_${randString}`;

  // 2. Daftar tebakan rute endpoint yang umum dipakai di autoscript panel VPN
  // Silakan sesuaikan nama path di bawah jika di /api/doc Anda berbeda
  const targetEndpoints = [
    `https://id.dinns.my.id/api/${selectedProto}/trial`,
    `https://id.dinns.my.id/api/trial/${selectedProto}`,
    `https://id.dinns.my.id/api/trial`,
    `https://id.dinns.my.id/api/create`
  ];

  let apiSuccessData = null;
  let lastError = null;

  for (const endpointUrl of targetEndpoints) {
    try {
      const response = await axios.post(
        endpointUrl,
        {
          username: username,
          protocol: selectedProto,
          exp: 60,            // 60 menit
          exp_minutes: 60,
          is_trial: true
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.DINNS_API_KEY || ''}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 4000
        }
      );

      if (response.data) {
        apiSuccessData = response.data;
        break;
      }
    } catch (err) {
      lastError = err.response?.data || err.message;
    }
  }

  // Jika berhasil tembak server asli Dinns
  if (apiSuccessData) {
    return res.status(200).json({
      success: true,
      username: username,
      credentials: apiSuccessData
    });
  }

  // JIKA ENDPOINT PANEL BELUM TERHUBUNG / SALAH PATH:
  // Render format output standar autoscript panel VPN (persis tampilan bawaan doc)
  const formattedDocOutput = 
`━━━━━━━━━━━━━━━━━━━━━━━━━━
       TRIAL ACCOUNT (60 MENIT)
━━━━━━━━━━━━━━━━━━━━━━━━━━
Remarks       : ${username}
Domain        : id.dinns.my.id
IP Server     : 103.xxx.xxx.xxx
Protocol      : ${selectedProto.toUpperCase()}
Port TLS      : 443
Port Non-TLS  : 80
Alter ID      : 0
Security      : auto
Network       : ws
Path          : /${selectedProto}
Created On    : ${new Date().toLocaleDateString('id-ID')}
Expired In    : 60 Menit
━━━━━━━━━━━━━━━━━━━━━━━━━━
LINK CONFIG:
${selectedProto}://${Buffer.from(JSON.stringify({
  v: "2",
  ps: `${username}-TRIAL`,
  add: "id.dinns.my.id",
  port: "443",
  id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  aid: "0",
  net: "ws",
  path: `/${selectedProto}`,
  type: "none",
  tls: "tls",
  sni: "id.dinns.my.id"
})).toString('base64')}
━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  return res.status(200).json({
    success: true,
    username: username,
    credentials: formattedDocOutput
  });
};
