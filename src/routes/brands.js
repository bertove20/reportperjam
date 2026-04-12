/**
 * Brands Routes — CRUD + test connection
 */

import { getAllBrands, getBrandByKey, createBrand, updateBrand, deleteBrand, hardDeleteBrand, updateBrandCookie } from '../storage/brand-store.js';
import { fetchAsia77Daily, fetchAsia77Regis } from '../api/asia77-engine.js';
import { fetchSyntechDaily, fetchSyntechRegis } from '../api/syntech-engine.js';
// idns-engine di-import dynamic supaya error IDNS tidak break asia77/syntech
import { encrypt, decrypt } from '../utils/crypto.js';
import { DateTime } from '../utils/datetime.js';
import { logger } from '../logger.js';
import { tWhere } from '../middleware/tenant-scope.js';

export default async function brandRoutes(app) {
  // GET /api/brands — list all
  app.get('/api/brands', async (request) => {
    const tid = request.tenantId;
    const activeOnly = request.query.active !== 'false';
    return getAllBrands(activeOnly, tid);
  });

  // GET /api/brands/:key
  app.get('/api/brands/:key', async (request, reply) => {
    const tid = request.tenantId;
    const brand = await getBrandByKey(request.params.key, tid);
    if (!brand) return reply.code(404).send({ error: 'Brand not found' });

    // Mask sensitive fields
    if (brand.auth_pass) brand.auth_pass = '********';
    if (brand.auth_pin) brand.auth_pin = '****';
    if (brand.auth_api_key) brand.auth_api_key = '********';
    if (brand.auth_hash) brand.auth_hash = '********';
    return brand;
  });

  // POST /api/brands — create
  app.post('/api/brands', async (request, reply) => {
    const tid = request.tenantId;
    const data = request.body;
    if (!data.key || !data.name || !data.engine || !data.domain) {
      return reply.code(400).send({ error: 'key, name, engine, domain required' });
    }

    const existing = await getBrandByKey(data.key, tid);
    if (existing) {
      return reply.code(409).send({ error: `Brand ${data.key} already exists` });
    }

    // Encrypt sensitive fields
    if (data.auth_pass) data.auth_pass = encrypt(data.auth_pass);
    if (data.auth_pin) data.auth_pin = encrypt(data.auth_pin);
    if (data.auth_api_key) data.auth_api_key = encrypt(data.auth_api_key);
    if (data.auth_hash) data.auth_hash = encrypt(data.auth_hash);

    data.tenant_id = tid;
    const brand = await createBrand(data);
    logger.info({ key: brand.key }, 'Brand created via API');
    return reply.code(201).send(brand);
  });

  // PUT /api/brands/:key — update
  app.put('/api/brands/:key', async (request, reply) => {
    const tid = request.tenantId;
    const brand = await getBrandByKey(request.params.key, tid);
    if (!brand) return reply.code(404).send({ error: 'Brand not found' });

    const data = { ...request.body };

    // Encrypt sensitive fields if changed
    if (data.auth_pass && data.auth_pass !== '********') {
      data.auth_pass = encrypt(data.auth_pass);
    } else {
      delete data.auth_pass;
    }
    if (data.auth_pin && data.auth_pin !== '****') {
      data.auth_pin = encrypt(data.auth_pin);
    } else {
      delete data.auth_pin;
    }
    if (data.auth_api_key && data.auth_api_key !== '********') {
      data.auth_api_key = encrypt(data.auth_api_key);
    } else {
      delete data.auth_api_key;
    }
    if (data.auth_hash && data.auth_hash !== '********') {
      data.auth_hash = encrypt(data.auth_hash);
    } else {
      delete data.auth_hash;
    }

    const updated = await updateBrand(request.params.key, data, tid);
    logger.info({ key: updated.key }, 'Brand updated via API');
    return updated;
  });

  // DELETE /api/brands/:key
  app.delete('/api/brands/:key', async (request, reply) => {
    const tid = request.tenantId;
    const brand = await getBrandByKey(request.params.key, tid);
    if (!brand) return reply.code(404).send({ error: 'Brand not found' });

    const hard = request.query.hard === 'true';
    if (hard) {
      await hardDeleteBrand(request.params.key, tid);
    } else {
      await deleteBrand(request.params.key, tid);
    }

    logger.info({ key: request.params.key, hard }, 'Brand deleted via API');
    return { success: true };
  });

  // PATCH /api/brands/:key/cookie — update cookie only
  app.patch('/api/brands/:key/cookie', async (request, reply) => {
    const tid = request.tenantId;
    const brand = await getBrandByKey(request.params.key, tid);
    if (!brand) return reply.code(404).send({ error: 'Brand not found' });

    const { cookieHeader } = request.body || {};
    if (!cookieHeader) return reply.code(400).send({ error: 'cookieHeader required' });

    await updateBrandCookie(request.params.key, cookieHeader, tid);
    return { success: true };
  });

  // POST /api/brands/:key/login — buka browser untuk login, return cookie
  app.post('/api/brands/:key/login', async (request, reply) => {
    const tid = request.tenantId;
    const brand = await getBrandByKey(request.params.key, tid);
    if (!brand) return reply.code(404).send({ error: 'Brand not found' });

    try {
      const puppeteer = await import('puppeteer');
      const browser = await puppeteer.default.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--window-size=1280,800'],
        defaultViewport: { width: 1280, height: 800 },
        ...(process.env.PUPPETEER_EXECUTABLE_PATH && {
          executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        }),
      });

      const page = await browser.newPage();

      // Load existing cookies
      if (brand.cookie_header) {
        const cookies = brand.cookie_header.split(';').map(c => {
          const [name, ...rest] = c.trim().split('=');
          return { name: name.trim(), value: rest.join('=').trim(), domain: `.${brand.domain}`, path: '/' };
        }).filter(c => c.name && c.value);
        if (cookies.length > 0) await page.setCookie(...cookies);
      }

      await page.goto(`https://${brand.domain}`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});

      // Poll for SESSION cookie every 3 seconds (max 5 min)
      let cookieHeader = null;
      for (let i = 0; i < 100; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const allCookies = await page.cookies().catch(() => []);
        const session = allCookies.find(c => c.name === 'SESSION');
        if (session) {
          const important = allCookies.filter(c =>
            c.name === 'SESSION' || c.name === 'cf_clearance' || c.name === 'activeLang'
          );
          cookieHeader = important.map(c => `${c.name}=${c.value}`).join('; ');

          // Cek apakah sudah di dashboard (bukan halaman login)
          const url = page.url();
          if (url.includes('/user/') || url.includes('/home') || url.includes('/dashboard')) {
            break;
          }
        }
      }

      await browser.close();

      if (cookieHeader) {
        await updateBrandCookie(brand.key, cookieHeader, tid);
        return { success: true, message: `Cookie captured and saved for ${brand.name}` };
      } else {
        return reply.code(408).send({ success: false, error: 'Login timeout — no SESSION cookie detected in 5 minutes' });
      }
    } catch (err) {
      return reply.code(500).send({ success: false, error: err.message });
    }
  });

  // POST /api/brands/:key/test — test fetch
  app.post('/api/brands/:key/test', async (request, reply) => {
    const tid = request.tenantId;
    const brand = await getBrandByKey(request.params.key, tid);
    if (!brand) return reply.code(404).send({ error: 'Brand not found' });

    try {
      if (brand.engine === 'asia77') {
        const daily = await fetchAsia77Daily(brand.key, brand.domain, brand.cookie_header);
        const trx = daily.dpapp || 0;

        const dt = new DateTime();
        const regis = await fetchAsia77Regis(
          brand.key, brand.domain, dt.toDDMMYYYY(), brand.user_id, brand.cookie_header
        );

        return { success: true, engine: 'asia77', trx, regis, raw: daily };
      } else if (brand.engine === 'syntech') {
        const config = {
          domain: brand.domain,
          user: brand.auth_user,
          pass: decrypt(brand.auth_pass),
          pin: decrypt(brand.auth_pin),
          apiKey: decrypt(brand.auth_api_key),
          hash: decrypt(brand.auth_hash),
        };

        const dt = new DateTime();
        const dateStr = dt.toDateStr();
        const dateISO = `${dateStr}T${String(dt.hour).padStart(2, '0')}:00:00+07:00`;

        const daily = await fetchSyntechDaily(config, dateISO);
        const trx = daily.deposit_action_accepted_count || 0;

        const startISO = `${dateStr}T00:00:00+07:00`;
        const endISO = `${dateStr}T23:59:59+07:00`;
        const regis = await fetchSyntechRegis(config, startISO, endISO);

        return { success: true, engine: 'syntech', trx, regis, raw: daily };
      } else if (brand.engine === 'idns') {
        const idns = await import('../api/idns-engine.js');
        const dt = new DateTime();
        const dateStr = dt.toDateStr();

        const trx = await idns.fetchIdnsDaily(brand.key, brand.domain, brand.cookie_header, brand.user_id, dateStr);
        const regis = await idns.fetchIdnsRegis(brand.key, brand.domain, brand.cookie_header, dateStr);

        return { success: true, engine: 'idns', trx, regis };
      } else {
        return reply.code(400).send({ success: false, error: `Unknown engine: ${brand.engine}` });
      }
    } catch (err) {
      return reply.code(500).send({ success: false, error: err.message });
    }
  });
}
