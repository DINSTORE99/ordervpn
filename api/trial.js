const axios = require('axios');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { protocol } = req.body || {};
  const proto = protocol || 'ssh';

  // Endpoint panel Dinns dengan auth key Anda
  const authKey = 'pl67k9xp37';
  
  // Menyesuaikan endpoint jika user memilih ssh, vmess, vless, atau trojan
  const targetUrl = `https://id.dinns.my.id/api/trial-${proto}?auth=${authKey}`;

  try {
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      },
      timeout: 15000
    });

    if (response.data && response.data.status === 'success') {
      return res.status(200).json({
        success: true,
        credentials: response.data
      });
    } else {
      return res.status(400).json({
        error: response.data?.message || 'Gagal membuat akun trial di server.'
      });
    }

  } catch (err) {
    console.error('Error Dinns API:', err.response?.data || err.message);
    const errMsg = err.response?.data?.message || err.message;
    return res.status(500).json({
      error: `Server VPS Error: ${errMsg}`
    });
  }
};
