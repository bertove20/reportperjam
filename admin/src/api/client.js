const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

export function setToken(token) {
  localStorage.setItem('token', token);
}

export function clearToken() {
  localStorage.removeItem('token');
}

export function isAuthenticated() {
  return !!getToken();
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = { ...options.headers };

  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Auth
export const auth = {
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),
  me: () => request('/auth/me'),
  changePassword: (oldPassword, newPassword) => request('/auth/change-password', { method: 'POST', body: { oldPassword, newPassword } }),
};

// Brands
export const brands = {
  list: (activeOnly = true) => request(`/brands?active=${activeOnly}`),
  get: (key) => request(`/brands/${key}`),
  create: (data) => request('/brands', { method: 'POST', body: data }),
  update: (key, data) => request(`/brands/${key}`, { method: 'PUT', body: data }),
  delete: (key, hard = false) => request(`/brands/${key}?hard=${hard}`, { method: 'DELETE' }),
  updateCookie: (key, cookieHeader) => request(`/brands/${key}/cookie`, { method: 'PATCH', body: { cookieHeader } }),
  test: (key) => request(`/brands/${key}/test`, { method: 'POST' }),
  login: (key) => request(`/brands/${key}/login`, { method: 'POST' }),
};

// Reports
export const reports = {
  hourly: (brand, date) => request(`/reports/hourly?brand=${brand}&date=${date}`),
  dailySummary: (brand, from, to) => request(`/reports/daily-summary?brand=${brand}&from=${from}&to=${to}`),
  comparison: (date) => request(`/reports/comparison?date=${date}`),
  chartData: (brand, from, to) => request(`/reports/chart-data?brand=${brand}&from=${from}&to=${to}`),
  dates: (brand) => request(`/reports/dates?brand=${brand}`),
  summary: (brand, date) => request(`/reports/summary?brand=${brand}&date=${date}`),
};

// Settings
export const settings = {
  get: () => request('/settings'),
  update: (data) => request('/settings', { method: 'PUT', body: data }),
  testTelegram: () => request('/settings/test-telegram', { method: 'POST' }),
};

// Monitoring
export const monitoring = {
  status: () => request('/status'),
  logs: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/logs?${qs}`);
  },
};

// Actions
export const actions = {
  fetchNow: (brandKey) => request('/actions/fetch-now', { method: 'POST', body: { brandKey } }),
  reportNow: (brandKey) => request('/actions/report-now', { method: 'POST', body: { brandKey } }),
  fetchFinish: (date) => request('/actions/fetch-finish', { method: 'POST', body: { date } }),
  backfill: (date, brandKey) => request('/actions/backfill', { method: 'POST', body: { date, brandKey } }),
  missingHours: (brand, date) => request(`/actions/missing-hours?brand=${brand}&date=${date}`),
};
