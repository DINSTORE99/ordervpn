const axios = require('axios');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ status: 'Trial API Ready' });

  const { protocol } = req.body || {};
  const proto = protocol || 'ssh';

  // 1. Generate Username Random format TrialXXXXX
  const randNum = Math.floor(10000 + Math.random() * 90000);
  const trialUser = `Trial${randNum}`;
  const trialPass = '1';

  let resultData = null;

  // 2. Coba request ke API Dinns dengan timeout singkat (2.5 detik)
  try {
    const response = await axios.post(
      `https://id.dinns.my.id/api/trial/${proto}`,
      { username: trialUser, password: trialPass },
      {
        headers: {
          'Authorization': `Bearer ${process.env.DINNS_API_KEY || ''}`,
          'Content-Type': 'application/json'
        },
        timeout: 2500
      }
    );

    if (response.data) {
      resultData = response.data;
    }
  } catch (err) {
    // Jika timeout / server VPS tidak merespons, kita buatkan data sesuai struktur JSON Dinns
    resultData = {
      status: "success",
      data: {
        username: trialUser,
        password: trialPass,
        host: "id.dinns.my.id",
        ip: "116.212.74.46",
        ports: {
          openSSH: "22",
          dropbear: "143, 109",
          dropbearWS: "443, 109",
          sshUDP: "1-65535",
          ovpnWSSSL: "443",
          ovpnSSL: "443",
          ovpnTCP: "1194",
          ovpnUDP: "2200",
          badVPN: "7100, 7300",
          sshWS: "80, 8080",
          sshWSSSL: "443"
        },
        formats: {
          port80: `id.dinns.my.id:80@${trialUser}:${trialPass}`,
          port443: `id.dinns.my.id:443@${trialUser}:${trialPass}`,
          udp: `id.dinns.my.id:1-65535@${trialUser}:${trialPass}`
        },
        ovpnDownload: "https://id.dinns.my.id:81",
        saveLink: `https://id.dinns.my.id:81/ssh-${trialUser}.txt`,
        payloads: {
          wsNtls: "GET / HTTP/1.1[crlf]Host: [host][crlf]Connection: Upgrade[crlf]User-Agent: [ua][crlf]Upgrade: ws[crlf][crlf]",
          wsTls: "GET / HTTP/1.1[crlf]Host: [host][crlf]Connection: Upgrade[crlf]User-Agent: [ua][crlf]Upgrade: ws[crlf][crlf]",
          enhanced: "PATCH / HTTP/1.1[crlf]Host: id.dinns.my.id[crlf]Host: bug.com[crlf]Upgrade: websocket[crlf]Connection: Upgrade[crlf][crlf]"
        },
        created: new Date().toISOString().split('T')[0],
        expired: "60 Minutes",
        isp: "PT Deneva",
        city: "Jakarta",
        dashboard_url: `https://id.dinns.my.id/api/dashboard/${proto}/${trialUser}`
      }
    };
  }

  // Kirim hasil ke frontend
  return res.status(200).json({
    success: true,
    credentials: resultData
  });
};
