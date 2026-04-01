/**
 * Brands Routes — CRUD + test connection
 */

import { getAllBrands, getBrandByKey, createBrand, updateBrand, deleteBrand, hardDeleteBrand, updateBrandCookie } from '../storage/brand-store.js';
import { fetchAsia77Daily, fetchAsia77Regis } from '../api/asia77-engine.js';
import { encrypt } from '../utils/crypto.js';
import { DateTime } from '../utils/datetime.js';
import { logger } from '../logger.js';

export default async function brandRoutes(app) {
  // GET /api/brands — list all
  app.get('/api/brands', async (request) => {
    const activeOnly = request.query.active !== 'false';
    return getAllBrands(activeOnly);
  });

  // GET /api/brands/:key
  app.get('/api/brands/:key', async (request, reply) => {
    const brand = getBrandByKey(request.params.key);
    if (!brand) return reply.code(404).send({ error: 'Brand not found' });

    // Mask sensitive fields
    if (brand.auth_pass) brand.auth_pass = '********';
    if (brand.auth_pin) brand.auth_pin = '****';
    return brand;
  });

  // POST /api/brands — create
  app.post('/api/brands', async (request, reply) => {
    const data = request.body;
    if (!data.key || !data.name || !data.engine || !data.domain) {
      return reply.code(400).send({ error: 'key, name, engine, domain required' });
    }

    const existing = getBrandByKey(data.key);
    if (existing) {
      return reply.code(409).send({ error: `Brand ${data.key} already exists` });
    }

    // Encrypt sensitive fields
    if (data.auth_pass) data.auth_pass = encrypt(data.auth_pass);
    if (data.auth_pin) data.auth_pin = encrypt(data.auth_pin);

    const brand = createBrand(data);
    logger.info({ key: brand.key }, 'Brand created via API');
    return reply.code(201).send(brand);
  });

  // PUT /api/brands/:key — update
  app.put('/api/brands/:key', async (request, reply) => {
    const brand = getBrandByKey(request.params.key);
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

    const updated = updateBrand(request.params.key, data);
    logger.info({ key: updated.key }, 'Brand updated via API');
    return updated;
  });

  // DELETE /api/brands/:key
  app.delete('/api/brands/:key', async (request, reply) => {
    const brand = getBrandByKey(request.params.key);
    if (!brand) return reply.code(404).send({ error: 'Brand not found' });

    const hard = request.query.hard === 'true';
    if (hard) {
      hardDeleteBrand(request.params.key);
    } else {
      deleteBrand(request.params.key);
    }

    logger.info({ key: request.params.key, hard }, 'Brand deleted via API');
    return { success: true };
  });

  // PATCH /api/brands/:key/cookie — update cookie only
  app.patch('/api/brands/:key/cookie', async (request, reply) => {
    const brand = getBrandByKey(request.params.key);
    if (!brand) return reply.code(404).send({ error: 'Brand not found' });

    const { cookieHeader } = request.body || {};
    if (!cookieHeader) return reply.code(400).send({ error: 'cookieHeader required' });

    updateBrandCookie(request.params.key, cookieHeader);
    return { success: true };
  });

  // POST /api/brands/:key/login — buka browser untuk login, return cookie
  app.post('/api/brands/:key/login', async (request, reply) => {
    const brand = getBrandByKey(request.params.key);
    if (!brand) return reply.code(404).send({ error: 'Brand not found' });

    try {
      const puppeteer = await import('puppeteer');
      const browser = await puppeteer.default.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800'],
        defaultViewport: { width: 1280, height: 800 },
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
        updateBrandCookie(brand.key, cookieHeader);
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
    const brand = getBrandByKey(request.params.key);
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
      } else {
        return { success: true, engine: 'syntech', message: 'Syntech test not implemented yet' };
      }
    } catch (err) {
      return reply.code(500).send({ success: false, error: err.message });
    }
  });
}
