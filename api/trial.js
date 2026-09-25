const axios = require('axios');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ status: 'Trial API Ready' });

  const { protocol } = req.body || {};
  const proto = protocol || 'ssh';

  // Endpoint panel Dinns untuk trial (menyesuaikan tipe protokol yang dipilih)
  const trialUrl = `https://id.dinns.my.id/api/trial/${proto}`;

  try {
    const response = await axios.post(
      trialUrl,
      {}, // Sebagian panel tidak memerlukan body karena nama dibuat otomatis oleh server
      {
        headers: {
          'Authorization': `Bearer ${process.env.DINNS_API_KEY || ''}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 9000
      }
    );

    return res.status(200).json({
      success: true,
      credentials: response.data
    });

  } catch (err) {
    console.error('API Dinns Error:', err.response?.data || err.message);

    // Kirim respons error asli dari panel jika ada
    if (err.response?.data) {
      return res.status(err.response.status || 500).json({
        error: err.response.data.message || JSON.stringify(err.response.data)
      });
    }

    return res.status(500).json({ error: 'Gagal terhubung ke API dinns.my.id: ' + err.message });
  }
};
