/**
 * ENGINE TYPE B: Syntech/WIS — JWT Authentication
 * 
 * Panel yang pakai JWT token. Tidak perlu browser/cookie.
 * Bisa fetch langsung dari Node.js.
 * 
 * Auth flow:
 *   1. POST /services/login → dapat token + refresh_token
 *   2. POST /services/pin/validate → unlock menu access
 *   3. Pakai token di header: Authorization: Bearer <token>
 *   4. Token expired → re-login otomatis (auto re-auth on 401)
 * 
 * API Endpoints yang dipakai:
 *   GET /services/transactions/summary  → TRX: deposit_action_accepted_count
 *   GET /services/players               → REGIS: meta.total
 *   GET /services/report/providers      → W/L: whitelabel.total (TIDAK dipakai di Tim report)
 *   GET /services/dashboard             → Overview (optional)
 */

import { logger } from '../logger.js';

let jwtToken = null;
let tokenExpiry = 0;

/**
 * Login dan dapatkan JWT token
 * 
 * @param {string} domain - e.g. 'panel-d.example.com'
 * @param {string} username
 * @param {string} password
 * @param {string} pin - full PIN (e.g. '123456')
 * @returns {string} JWT token
 */
async function authenticate(domain, username, password, pin) {
  // Step 1: Login
  const loginRes = await fetch(`https://${domain}/services/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, remember: true, hash: '' }),
  });
  const loginData = await loginRes.json();
  
  if (!loginData?.data?.token) {
    throw new Error(`Syntech login failed: ${JSON.stringify(loginData)}`);
  }

  const token = loginData.data.token;
  const hash = loginData.data.hash;

  // Step 2: PIN validation
  // PIN challenge: panel minta digit di posisi random
  // Untuk simplicity, kirim semua posisi PIN
  // Format pin: "123456" → {"1":"1","2":"2","3":"3","4":"4","5":"5","6":"6"}
  const pinInput = {};
  for (let i = 0; i < pin.length; i++) {
    pinInput[String(i + 1)] = pin[i];
  }

  await fetch(`https://${domain}/services/pin/validate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ input: pinInput, hash }),
  });

  jwtToken = token;
  tokenExpiry = Date.now() + (23 * 60 * 60 * 1000); // 23 jam (buffer dari 24 jam)
  
  logger.info({ domain }, 'Syntech JWT authenticated');
  return token;
}

/**
 * Dapatkan token (re-auth jika expired)
 */
async function getToken(config) {
  if (jwtToken && Date.now() < tokenExpiry) return jwtToken;
  return authenticate(config.domain, config.user, config.pass, config.pin);
}

/**
 * Fetch dengan auto re-auth pada 401
 */
async function fetchWithAuth(url, config) {
  let token = await getToken(config);
  
  let response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  // Auto re-auth jika 401
  if (response.status === 401) {
    logger.warn('Syntech 401 — re-authenticating');
    jwtToken = null;
    token = await getToken(config);
    response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
  }

  if (!response.ok) {
    throw new Error(`Syntech API ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch TRX (approved deposit count)
 * 
 * @param {object} config - { domain, user, pass, pin }
 * @param {string} dateISO - ISO 8601 format (e.g. '2026-03-25T14:00:00+07:00')
 * @returns {object} { deposit_action_accepted_count, ... }
 */
export async function fetchSyntechDaily(config, dateISO) {
  const url = `https://${config.domain}/services/transactions/summary?date=${encodeURIComponent(dateISO)}&new_player=false`;
  const result = await fetchWithAuth(url, config);
  return result.data;
}

/**
 * Fetch REGIS (total registrasi)
 * 
 * @param {object} config - { domain, user, pass, pin }
 * @param {string} startISO - start date ISO
 * @param {string} endISO - end date ISO
 * @returns {number} total registrations
 */
export async function fetchSyntechRegis(config, startISO, endISO) {
  const url = `https://${config.domain}/services/players?start_date=${encodeURIComponent(startISO)}&end_date=${encodeURIComponent(endISO)}`;
  const result = await fetchWithAuth(url, config);
  return result.meta?.total || 0;
}
