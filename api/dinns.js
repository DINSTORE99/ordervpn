import axios from 'axios';

const CONFIG = {
  BASE_URL: 'https://id.dinns.my.id/api',
  API_KEY: process.env.DINNS_API_KEY || 'MASUKKAN_API_KEY_ANDA_DI_SINI',

  getHeaders() {
    return {
      'Authorization': `Bearer ${this.API_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }
};

// Fungsi generate random username untuk trial (contoh: trial_a8c2f1)
export function generateRandomUsername() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let rand = '';
  for (let i = 0; i < 6; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `trial_${rand}`;
}

/**
 * 1. API TRIAL (60 Menit) - Otomatis Random User
 */
export async function createTrialAccount(username, protocol) {
  const url = `${CONFIG.BASE_URL}/trial`;

  const payload = {
    username: username,
    protocol: protocol,
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
 * 2. API ORDER RESMI (Username + Password + Durasi Hari)
 */
export async function createOfficialAccount(username, password, protocol, days) {
  const url = `${CONFIG.BASE_URL}/create-account`;

  const payload = {
    username: username,
    password: password,
    protocol: protocol,
    exp_days: days
  };

  const response = await axios.post(url, payload, {
    headers: CONFIG.getHeaders(),
    timeout: 10000
  });

  return response.data;
}
