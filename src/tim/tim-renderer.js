/**
 * Tim Report Renderer — HTML → PNG via Puppeteer
 * 
 * Reuse 1 browser instance per batch.
 * browser.close() di finally block SELALU.
 */

import puppeteer from 'puppeteer';
import { logger } from '../logger.js';

/**
 * Render HTML string menjadi PNG buffer
 * @param {string} html - HTML lengkap
 * @returns {Buffer} PNG image buffer
 */
export async function renderPng(html) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 650, height: 100 }); // height auto-expand
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    
    const png = await page.screenshot({ fullPage: true, type: 'png' });
    await page.close();
    
    // Fallback JPEG jika PNG > 5MB (Telegram limit ~10MB)
    if (png.length > 5 * 1024 * 1024) {
      logger.warn({ size: png.length }, 'PNG too large, using JPEG fallback');
      const page2 = await browser.newPage();
      await page2.setViewport({ width: 650, height: 100 });
      await page2.setContent(html, { waitUntil: 'domcontentloaded' });
      const jpeg = await page2.screenshot({ fullPage: true, type: 'jpeg', quality: 85 });
      await page2.close();
      return jpeg;
    }

    return png;
  } finally {
    await browser.close();
  }
}
