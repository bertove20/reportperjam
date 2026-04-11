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

// Referrals (brand → referral → division mapping)
export const referrals = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/referrals${qs ? `?${qs}` : ''}`)
  },
  create: (data) => request('/referrals', { method: 'POST', body: data }),
  update: (id, data) => request(`/referrals/${id}`, { method: 'PUT', body: data }),
  delete: (id) => request(`/referrals/${id}`, { method: 'DELETE' }),
  dashboard: (divisionId, date) => request(`/referrals/dashboard?division_id=${divisionId}&date=${date}`),
}

// Settings (module-scoped)
export const settings = {
  get: (module = 'report') => request(`/settings?module=${module}`),
  update: (data) => request('/settings', { method: 'PUT', body: data }),
  testTelegram: (module = 'report') => request(`/settings/test-telegram?module=${module}`, { method: 'POST' }),
};

// Finance
export const finance = {
  dashboard: (month, year) => request(`/finance/dashboard?month=${month}&year=${year}`),
  transactions: {
    list: (params = {}) => { const qs = new URLSearchParams(params).toString(); return request(`/finance/transactions?${qs}`) },
    get: (id) => request(`/finance/transactions/${id}`),
    create: (data) => request('/finance/transactions', { method: 'POST', body: data }),
    update: (id, data) => request(`/finance/transactions/${id}`, { method: 'PUT', body: data }),
    delete: (id) => request(`/finance/transactions/${id}`, { method: 'DELETE' }),
    formData: () => request('/finance/transactions/form-data'),
  },
  brands: {
    list: () => request('/finance/brands'),
    get: (id) => request(`/finance/brands/${id}`),
    create: (data) => request('/finance/brands', { method: 'POST', body: data }),
    update: (id, data) => request(`/finance/brands/${id}`, { method: 'PUT', body: data }),
    delete: (id) => request(`/finance/brands/${id}`, { method: 'DELETE' }),
    budget: (id) => request(`/finance/brands/${id}/budget`),
    setBudget: (id, data) => request(`/finance/brands/${id}/budget`, { method: 'POST', body: data }),
  },
  banks: {
    list: () => request('/finance/banks'),
    create: (data) => request('/finance/banks', { method: 'POST', body: data }),
    update: (id, data) => request(`/finance/banks/${id}`, { method: 'PUT', body: data }),
    delete: (id) => request(`/finance/banks/${id}`, { method: 'DELETE' }),
    wallets: (id) => request(`/finance/banks/${id}/wallets`),
  },
  paymentMethods: {
    list: () => request('/finance/payment-methods'),
    create: (data) => request('/finance/payment-methods', { method: 'POST', body: data }),
    update: (id, data) => request(`/finance/payment-methods/${id}`, { method: 'PUT', body: data }),
    delete: (id) => request(`/finance/payment-methods/${id}`, { method: 'DELETE' }),
  },
  balance: {
    list: () => request('/finance/balance'),
    topup: (data) => request('/finance/balance/topup', { method: 'POST', body: data }),
    transfer: (data) => request('/finance/balance/transfer', { method: 'POST', body: data }),
    history: (id) => request(`/finance/balance/history/${id}`),
  },
  categories: {
    list: () => request('/finance/categories'),
    create: (data) => request('/finance/categories', { method: 'POST', body: data }),
    delete: (id) => request(`/finance/categories/${id}`, { method: 'DELETE' }),
    byTeam: (teamId) => request(`/finance/categories/by-team/${teamId}`),
  },
  teams: {
    list: () => request('/finance/teams'),
    create: (data) => request('/finance/teams', { method: 'POST', body: data }),
    delete: (id) => request(`/finance/teams/${id}`, { method: 'DELETE' }),
  },
  loans: {
    list: () => request('/finance/loans'),
    get: (id) => request(`/finance/loans/${id}`),
    create: (data) => request('/finance/loans', { method: 'POST', body: data }),
    repay: (id, data) => request(`/finance/loans/${id}/repay`, { method: 'POST', body: data }),
    delete: (id) => request(`/finance/loans/${id}`, { method: 'DELETE' }),
  },
  reports: (params = {}) => { const qs = new URLSearchParams(params).toString(); return request(`/finance/reports?${qs}`) },
};

// Platform Admin (SaaS)
export const platform = {
  dashboard: () => request('/platform/dashboard'),
  tenants: {
    list: () => request('/platform/tenants'),
    create: (data) => request('/platform/tenants', { method: 'POST', body: data }),
    update: (id, data) => request(`/platform/tenants/${id}`, { method: 'PUT', body: data }),
    delete: (id) => request(`/platform/tenants/${id}`, { method: 'DELETE' }),
    impersonate: (id) => request(`/platform/tenants/${id}/impersonate`, { method: 'POST' }),
  },
  plans: {
    list: () => request('/platform/plans'),
    create: (data) => request('/platform/plans', { method: 'POST', body: data }),
    update: (id, data) => request(`/platform/plans/${id}`, { method: 'PUT', body: data }),
  },
};

// Home
export const home = {
  dashboard: () => request('/home/dashboard'),
};

// Signup (public)
export const signup = (data) => request('/signup', { method: 'POST', body: data });

// Tenant info (public)
export const tenantInfo = () => request('/tenant-info');

// Users & Divisions (admin)
export const admin = {
  users: {
    list: () => request('/users'),
    create: (data) => request('/users', { method: 'POST', body: data }),
    update: (id, data) => request(`/users/${id}`, { method: 'PUT', body: data }),
    delete: (id) => request(`/users/${id}`, { method: 'DELETE' }),
  },
  divisions: {
    list: () => request('/divisions'),
    create: (data) => request('/divisions', { method: 'POST', body: data }),
    update: (id, data) => request(`/divisions/${id}`, { method: 'PUT', body: data }),
    delete: (id) => request(`/divisions/${id}`, { method: 'DELETE' }),
  },
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
  referralReportNow: (date, divisionId) => request('/actions/referral-report-now', { method: 'POST', body: { date, divisionId } }),
  referralReportSingle: (referralId, date) => request('/actions/referral-report-single', { method: 'POST', body: { referralId, date } }),
  referralBackfill: (startDate, endDate, divisionId) => request('/actions/referral-backfill', { method: 'POST', body: { startDate, endDate, divisionId } }),
  fetchFinish: (date) => request('/actions/fetch-finish', { method: 'POST', body: { date } }),
  backfill: (date, brandKey) => request('/actions/backfill', { method: 'POST', body: { date, brandKey } }),
  missingHours: (brand, date) => request(`/actions/missing-hours?brand=${brand}&date=${date}`),
};
