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
 *
 * Beberapa panel butuh API key tambahan dikirim sebagai header
 * `x-data-reference: <UUID>`. Header ini optional — kalau brand tidak
 * konfigurasi apiKey, header tidak dikirim (backward compatible).
 */

import { logger } from '../logger.js';

// Token cache per-domain — supaya multiple brand syntech tidak saling override
const tokenCache = new Map(); // domain → { token, expiry }

/**
 * Bangun headers default untuk semua request.
 * Selalu kirim x-data-reference kalau apiKey ada (login + authenticated).
 */
function buildHeaders(config, token = null) {
  const headers = {
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
  };
  if (config.apiKey) {
    headers['x-data-reference'] = config.apiKey;
  }
  // Match panel JS quirk: kirim Authorization header bahkan saat token belum ada
  headers['Authorization'] = token ? `Bearer ${token}` : 'Bearer undefined';
  return headers;
}

/**
 * Login dan dapatkan JWT token
 */
async function authenticate(config) {
  const { domain, user: username, pass: password, pin } = config;

  // Step 1: Login
  // `hash` adalah session fingerprint yang panel butuh untuk anti-replay.
  // Untuk panel joko77 / WIS variants, hash bersifat statis per akun/device
  // dan harus disimpan sebagai bagian dari brand config (auth_hash).
  // Untuk panel syntech original yang tidak butuh hash, fallback ke ''.
  const loginRes = await fetch(`https://${domain}/services/login`, {
    method: 'POST',
    headers: buildHeaders(config, null),
    body: JSON.stringify({
      username,
      password,
      remember: true,
      hash: config.hash || '',
    }),
  });

  if (!loginRes.ok) {
    const text = await loginRes.text();
    throw new Error(`Syntech login failed: ${text}`);
  }

  const loginData = await loginRes.json();
  if (!loginData?.data?.token) {
    throw new Error(`Syntech login failed: ${JSON.stringify(loginData)}`);
  }

  const token = loginData.data.token;
  const hash = loginData.data.hash;

  // Step 2: PIN validation (kalau ada PIN)
  if (pin) {
    const pinInput = {};
    for (let i = 0; i < pin.length; i++) {
      pinInput[String(i + 1)] = pin[i];
    }

    await fetch(`https://${domain}/services/pin/validate`, {
      method: 'POST',
      headers: buildHeaders(config, token),
      body: JSON.stringify({ input: pinInput, hash }),
    });
  }

  // Cache token per-domain (23 jam buffer dari typical 24 jam expiry)
  tokenCache.set(domain, {
    token,
    expiry: Date.now() + (23 * 60 * 60 * 1000),
  });

  logger.info({ domain }, 'Syntech JWT authenticated');
  return token;
}

/**
 * Dapatkan token (re-auth jika expired) — per-domain
 */
async function getToken(config) {
  const cached = tokenCache.get(config.domain);
  if (cached && Date.now() < cached.expiry) return cached.token;
  return authenticate(config);
}

/**
 * Fetch dengan auto re-auth pada 401
 */
async function fetchWithAuth(url, config) {
  let token = await getToken(config);

  let response = await fetch(url, {
    headers: buildHeaders(config, token),
  });

  // Auto re-auth jika 401
  if (response.status === 401) {
    logger.warn({ domain: config.domain }, 'Syntech 401 — re-authenticating');
    tokenCache.delete(config.domain);
    token = await getToken(config);
    response = await fetch(url, {
      headers: buildHeaders(config, token),
    });
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Syntech API ${response.status}: ${text || response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch TRX (approved deposit count)
 *
 * @param {object} config - { domain, user, pass, pin, apiKey }
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
 * @param {object} config - { domain, user, pass, pin, apiKey }
 * @param {string} startISO - start date ISO
 * @param {string} endISO - end date ISO
 * @returns {number} total registrations
 */
export async function fetchSyntechRegis(config, startISO, endISO) {
  const url = `https://${config.domain}/services/players?start_date=${encodeURIComponent(startISO)}&end_date=${encodeURIComponent(endISO)}`;
  const result = await fetchWithAuth(url, config);
  return result.meta?.total || 0;
}

/**
 * Fetch SEMUA player di rentang tanggal dengan field created_at — untuk backfill
 * REGIS per jam (mirip fetchAllMembersWithTime di asia77).
 *
 * Paginate sampai meta.total atau halaman kosong.
 *
 * @param {object} config - { domain, user, pass, pin, apiKey, hash }
 * @param {string} startISO - start date ISO (e.g. '2026-04-11T00:00:00.000+07:00')
 * @param {string} endISO - end date ISO   (e.g. '2026-04-11T23:59:59.999+07:00')
 * @returns {Array<{created_at: string, ...}>}
 */
export async function fetchSyntechPlayersWithTime(config, startISO, endISO) {
  const limit = 200;
  const players = [];
  let page = 1;

  while (true) {
    const params = new URLSearchParams({
      page: String(page),
      sort: 'created_at:asc',
      limit: String(limit),
      start_date: startISO,
      end_date: endISO,
      referred: 'false',
      without_bank_account: 'false',
    });
    const url = `https://${config.domain}/services/players?${params.toString()}`;
    const result = await fetchWithAuth(url, config);

    const batch = result?.data || [];
    players.push(...batch);

    if (batch.length < limit) break;
    page++;

    // Safety cap supaya tidak loop tak terbatas kalau API misbehave
    if (page > 100) {
      logger.warn({ domain: config.domain, page }, 'Syntech players pagination cap hit');
      break;
    }

    await new Promise(r => setTimeout(r, 300));
  }

  return players;
}
