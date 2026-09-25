const axios = require('axios');

const AUTH_KEY = 'pl67k9xp37';

async function createOfficialAccount(username, password, protocol, days) {
  const proto = protocol || 'ssh';

  // Format pembuatan akun resmi panel Dinns
  const targetUrl = `https://id.dinns.my.id/api/create-${proto}?auth=${AUTH_KEY}`;

  const payload = {
    username: username,
    password: password,
    exp: days
  };

  const response = await axios.post(targetUrl, payload, {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0'
    },
    timeout: 15000
  });

  return response.data;
}

module.exports = { createOfficialAccount };
