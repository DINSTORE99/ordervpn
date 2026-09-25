const axios = require('axios');

const CONFIG = {
  BASE_URL: 'https://id.dinns.my.id/api',
  API_KEY: process.env.DINNS_API_KEY || ''
};

async function createOfficialAccount(username, password, protocol, days) {
  const proto = protocol || 'ssh';
  const url = `${CONFIG.BASE_URL}/create/${proto}`;

  const payload = {
    username: username,
    password: password,
    exp: days // jumlah hari aktif
  };

  const response = await axios.post(url, payload, {
    headers: {
      'Authorization': `Bearer ${CONFIG.API_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    timeout: 10000
  });

  return response.data;
}

module.exports = { createOfficialAccount };
