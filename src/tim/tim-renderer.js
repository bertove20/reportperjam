/**
 * Tim Report Renderer — HTML → PNG via Puppeteer
 */

import puppeteer from 'puppeteer';
import { logger } from '../logger.js';

/**
 * Render HTML string menjadi PNG buffer
 * @param {string} html - HTML lengkap
 * @param {Object} [opts]
 * @param {number} [opts.width=650] - viewport width (override untuk layout lebar)
 * @returns {Buffer} PNG image buffer
 */
export async function renderPng(html, opts = {}) {
  const width = opts.width || 650;
  const launchOptions = {
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  };
  // VPS: pakai system chromium jika tersedia
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const browser = await puppeteer.launch(launchOptions);

  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 100 });
    await page.setContent(html, { waitUntil: 'load' });

    // Tunggu sebentar untuk base64 images render
    await new Promise(r => setTimeout(r, 300));

    const png = await page.screenshot({ fullPage: true, type: 'png' });
    await page.close();

    // Fallback JPEG jika PNG > 5MB
    if (png.length > 5 * 1024 * 1024) {
      logger.warn({ size: png.length }, 'PNG too large, using JPEG fallback');
      const page2 = await browser.newPage();
      await page2.setViewport({ width, height: 100 });
      await page2.setContent(html, { waitUntil: 'load' });
      await new Promise(r => setTimeout(r, 300));
      const jpeg = await page2.screenshot({ fullPage: true, type: 'jpeg', quality: 85 });
      await page2.close();
      return jpeg;
    }

    return png;
  } finally {
    await browser.close();
  }
}
