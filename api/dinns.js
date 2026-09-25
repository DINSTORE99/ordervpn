import axios from 'axios';

// ==============================================================
// ⚙️ PENGATURAN API DINNS (UBAH DI SINI)
// ==============================================================
const CONFIG = {
  // Base URL API Anda
  BASE_URL: 'https://id.dinns.my.id/api',

  // Masukkan API Key Anda di sini (atau pasang di Environment Variables Vercel)
  API_KEY: process.env.DINNS_API_KEY || 'MASUKKAN_API_KEY_ANDA_DI_SINI',

  // Model Header: Kebanyakan panel menggunakan Bearer Token atau X-API-KEY
  getHeaders() {
    return {
      'Authorization': `Bearer ${this.API_KEY}`,
      // Jika panel menggunakan X-API-KEY, ganti baris di atas dengan:
      // 'x-api-key': this.API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }
};

/**
 * 1. FUNGSI UNTUK TRIAL (60 Menit)
 */
export async function createTrialAccount(username, protocol) {
  // Sesuaikan nama endpoint dan body sesuai https://id.dinns.my.id/api/doc
  // Contoh endpoint: /trial atau /vmess/trial
  const url = `${CONFIG.BASE_URL}/trial`;

  const payload = {
    username: username,
    protocol: protocol, // vmess, vless, trojan, ssh
    exp: 60,            // 60 menit
    is_trial: true
  };

  const response = await axios.post(url, payload, {
    headers: CONFIG.getHeaders(),
    timeout: 8000
  });

  return response.data;
}

/**
 * 2. FUNGSI UNTUK PEMBELIAN RESMI (1 - 30 Hari)
 */
export async function createOfficialAccount(username, protocol, days) {
  // Contoh endpoint: /create atau /order/create
  const url = `${CONFIG.BASE_URL}/create-account`;

  const payload = {
    username: username,
    protocol: protocol,
    exp_days: days
  };

  const response = await axios.post(url, payload, {
    headers: CONFIG.getHeaders(),
    timeout: 10000
  });

  return response.data;
}
