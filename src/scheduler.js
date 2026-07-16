/**
 * Scheduler — Multi-tenant cron jobs
 *
 * Iterates over all active tenants and runs fetch/report for each.
 */

import cron from 'node-cron';
import { queryRows } from './storage/postgres.js';
import { getSetting } from './storage/settings-store.js';
import { fetchAllBrands, fetchAllBrandsFinish, recoverMissingHours } from './api/fetch-brand.js';
import { sendTimReports } from './tim/tim-orchestrator.js';
import { sendReferralReports } from './tim/referral-report-orchestrator.js';
import { cleanLogsBeforeCurrentMonth } from './storage/log-store.js';
import { keepaliveAsia77 } from './api/asia77-engine.js';
import { getBrands } from './tim/brand-configs.js';
import { DateTime } from './utils/datetime.js';
import { logger } from './logger.js';

const jobs = [];

async function getActiveTenants() {
  return queryRows('SELECT id, name, slug FROM tenants WHERE is_active = 1');
}

export async function startScheduler() {
  // Use default timezone, individual tenants can override
  const defaultTz = process.env.TZ || 'Asia/Phnom_Penh';

  // ─── :00 Syntech fetch (jam 1-23) — FETCH ONLY, belum kirim ───
  // Syntech panel real-time, fetch persis di pergantian jam untuk snapshot paling akurat.
  // Report BELUM dikirim di sini — ditahan sampai :03 supaya semua brand
  // (syntech + asia77) terkirim bareng di waktu yang sama ke Telegram group.
  jobs.push(cron.schedule('0 1-23 * * *', async () => {
    const tenants = await getActiveTenants();
    for (const tenant of tenants) {
      try {
        const now = DateTime.now();
        const hour = now.hour;
        const dateStr = now.toDateStr();

        const allBrands = await getBrands(tenant.id);
        if (allBrands.filter(b => b.engine === 'syntech').length === 0) continue;

        logger.info({ tenant: tenant.slug, hour, engine: 'syntech' }, 'Syntech fetch starting');
        await fetchAllBrands(dateStr, hour, tenant.id, 'syntech');
      } catch (err) {
        logger.error({ tenant: tenant.slug, err: err.message }, 'Syntech fetch failed');
      }
    }
  }, { timezone: defaultTz }));

  // ─── :03 Syntech kirim report (jam 1-23) ───
  // Syntech data sudah di-fetch di :00 (panel real-time). Di sini tinggal recovery
  // + kirim report syntech. Asia77 TIDAK di sini — data panel asia77 delay, jadi
  // pengambilan data + kirim report-nya dimundurkan 20 menit ke :23 (cron berikutnya).
  jobs.push(cron.schedule('3 1-23 * * *', async () => {
    const tenants = await getActiveTenants();
    for (const tenant of tenants) {
      try {
        const now = DateTime.now();
        const hour = now.hour;
        const dateStr = now.toDateStr();

        const syntechBrands = (await getBrands(tenant.id)).filter(b => b.engine === 'syntech');
        if (syntechBrands.length === 0) continue;

        logger.info({ tenant: tenant.slug, hour }, ':03 syntech pipeline starting');

        // 1. Recovery (isi jam yang kosong dari data yang ada)
        await recoverMissingHours(dateStr, hour, tenant.id);

        // 2. Kirim report syntech saja
        logger.info({ tenant: tenant.slug, hour, engine: 'syntech' }, 'Sending syntech reports');
        await sendTimReports(hour, dateStr, now.yesterday().toDateStr(), null, tenant.id, 'syntech');
        logger.info({ tenant: tenant.slug, hour }, ':03 syntech pipeline complete');
      } catch (err) {
        logger.error({ tenant: tenant.slug, err: err.message }, ':03 syntech pipeline failed');
      }
    }
  }, { timezone: defaultTz }));

  // ─── :23 Asia77 fetch + kirim report (jam 1-23) — mundur 20 menit dari syntech ───
  // Data asia77 dari panel delay, jadi pengambilan data perjam + kirim report-nya
  // dimundurkan 20 menit (dari :03 ke :23) supaya angka yang diambil sudah ter-update panel.
  // Pipeline:
  //   1. Keepalive/refresh session asia77 (invalidate server cache)
  //   2. Fetch asia77 brands (data fresh setelah delay + cache clear)
  //   3. Recovery missing hours
  //   4. Kirim report asia77 saja
  jobs.push(cron.schedule('23 1-23 * * *', async () => {
    const tenants = await getActiveTenants();
    for (const tenant of tenants) {
      try {
        const now = DateTime.now();
        const hour = now.hour;
        const dateStr = now.toDateStr();

        const asia77Brands = (await getBrands(tenant.id)).filter(b => b.engine === 'asia77');
        if (asia77Brands.length === 0) continue;

        logger.info({ tenant: tenant.slug, hour }, ':23 asia77 pipeline starting');

        // 1. Pre-fetch refresh asia77 (per-brand try/catch supaya 1 gagal tidak block lainnya)
        for (const brand of asia77Brands) {
          try {
            await keepaliveAsia77(brand.key, brand.domain, brand.cookieHeader, brand.userId);
          } catch (err) {
            logger.warn({ brand: brand.key, err: err.message }, 'Pre-fetch keepalive failed, continuing');
          }
        }

        // 2. Fetch asia77 brands
        logger.info({ tenant: tenant.slug, hour, engine: 'asia77' }, 'Asia77 fetch starting');
        await fetchAllBrands(dateStr, hour, tenant.id, 'asia77');

        // 3. Recovery (isi jam yang kosong)
        await recoverMissingHours(dateStr, hour, tenant.id);

        // 4. Kirim report asia77 saja
        logger.info({ tenant: tenant.slug, hour, engine: 'asia77' }, 'Sending asia77 reports');
        await sendTimReports(hour, dateStr, now.yesterday().toDateStr(), null, tenant.id, 'asia77');
        logger.info({ tenant: tenant.slug, hour }, ':23 asia77 pipeline complete');
      } catch (err) {
        logger.error({ tenant: tenant.slug, err: err.message }, ':23 asia77 pipeline failed');
      }
    }
  }, { timezone: defaultTz }));

  // ─── 00:05 FINISH (syntech only) ───
  // Syntech panel real-time, FINISH bisa langsung dikirim normal di 00:05.
  // Asia77 di-skip di sini — datanya delay di pergantian hari, jadi di-fetch ulang
  // & dikirim di 00:27 (lihat cron berikutnya). Grup diberi info report asia77 menyusul.
  jobs.push(cron.schedule('5 0 * * *', async () => {
    const tenants = await getActiveTenants();
    for (const tenant of tenants) {
      try {
        const now = DateTime.now();
        const yesterdayStr = now.yesterday().toDateStr();
        const dayBeforeStr = now.minus(2).toDateStr();

        // Syntech FINISH — fetch + kirim normal
        await fetchAllBrandsFinish(yesterdayStr, tenant.id, 'syntech');
        await sendTimReports(0, yesterdayStr, dayBeforeStr, null, tenant.id, 'syntech');

        // Info ke grup: report asia77 menyusul ±00:30 (data panel delay)
        const asia77Brands = (await getBrands(tenant.id)).filter(b => b.engine === 'asia77');
        if (asia77Brands.length > 0) {
          try {
            const groupId = await getSetting('tg_report_group', 'report', tenant.id) || process.env.TG_REPORT_GROUP;
            if (groupId) {
              const { sendMessage } = await import('./tim/tim-sender.js');
              const names = asia77Brands.map(b => b.name || b.key).join(', ');
              const text = [
                '⏳ <b>Laporan FINISH menyusul</b>',
                '',
                `Report untuk <b>${names}</b> akan dikirim sekitar pukul <b>00:30 WIB</b>.`,
                'Menunggu data panel diperbarui (delay di pergantian hari).',
              ].join('\n');
              await sendMessage(groupId, text, tenant.id);
            }
          } catch (err) {
            logger.warn({ tenant: tenant.slug, err: err.message }, 'Asia77 delay-notice failed');
          }
        }
      } catch (err) {
        logger.error({ tenant: tenant.slug, err: err.message }, 'Tenant FINISH (syntech) failed');
      }
    }
  }, { timezone: defaultTz }));

  // ─── 00:30 FINISH (asia77) + Referral ───
  // Asia77 panel delay update data harian di pergantian hari, jadi FINISH-nya
  // di-fetch ulang & dikirim di sini (bukan 00:05). Waktu 00:30 sama persis dengan
  // info yang diumumkan ke grup di 00:05 supaya tidak ada selisih data.
  // Keepalive dulu supaya session tidak terlogout sebelum fetch.
  // Referral report (juga asia77-based) ikut di sini.
  jobs.push(cron.schedule('30 0 * * *', async () => {
    const tenants = await getActiveTenants();
    for (const tenant of tenants) {
      try {
        const now = DateTime.now();
        const yesterdayStr = now.yesterday().toDateStr();
        const dayBeforeStr = now.minus(2).toDateStr();

        const asia77Brands = (await getBrands(tenant.id)).filter(b => b.engine === 'asia77');

        // 0. Keepalive dulu — pastikan session asia77 tidak terlogout sebelum fetch
        for (const brand of asia77Brands) {
          try {
            await keepaliveAsia77(brand.key, brand.domain, brand.cookieHeader, brand.userId);
          } catch (err) {
            logger.warn({ brand: brand.key, err: err.message }, 'Pre-FINISH keepalive failed, continuing');
          }
        }

        // 1. Asia77 FINISH — fetch ulang (data panel sudah update) + kirim
        if (asia77Brands.length > 0) {
          await fetchAllBrandsFinish(yesterdayStr, tenant.id, 'asia77');
          await sendTimReports(0, yesterdayStr, dayBeforeStr, null, tenant.id, 'asia77');
        }

        // 2. Referral report harian per divisi — kirim untuk data kemarin
        try {
          await sendReferralReports(yesterdayStr, tenant.id);
        } catch (err) {
          logger.error({ tenant: tenant.slug, err: err.message }, 'Referral report failed');
        }
      } catch (err) {
        logger.error({ tenant: tenant.slug, err: err.message }, 'Tenant FINISH (asia77) failed');
      }
    }
  }, { timezone: defaultTz }));

  // ─── Keepalive: every 10 min (lebih sering dari 15 untuk safety margin) ───
  const keepaliveFailCounts = new Map(); // brandKey → consecutive fail count
  jobs.push(cron.schedule('*/10 * * * *', async () => {
    const tenants = await getActiveTenants();
    for (const tenant of tenants) {
      const brands = (await getBrands(tenant.id)).filter(b => b.engine === 'asia77');
      const failedBrands = [];

      for (const brand of brands) {
        const result = await keepaliveAsia77(brand.key, brand.domain, brand.cookieHeader, brand.userId);
        const key = brand.key;

        if (result.ok) {
          keepaliveFailCounts.set(key, 0);
        } else {
          const count = (keepaliveFailCounts.get(key) || 0) + 1;
          keepaliveFailCounts.set(key, count);
          logger.warn({ brand: key, error: result.error, consecutiveFails: count }, 'Keepalive failed');

          // Alert setelah 3x berturut-turut gagal (30 menit)
          if (count === 3) {
            failedBrands.push({ brand: brand.name || key, error: result.error });
          }
        }
      }

      // Kirim alert kalau ada brand yang gagal 3x berturut-turut
      if (failedBrands.length > 0) {
        const { sendAlert } = await import('./tim/tim-alert.js');
        const lines = [
          '⚠️ <b>KEEPALIVE FAILED — Cookie mungkin expired</b>',
          '',
          ...failedBrands.map(f => `❌ <b>${f.brand}</b>: ${f.error}`),
          '',
          '💡 Login ulang via Admin → Brands → Edit → paste cookie baru',
        ];
        sendAlert(lines.join('\n'), tenant.id).catch(() => {});
      }
    }
  }, { timezone: defaultTz }));

  // ─── Monthly cleanup: tanggal 1 jam 00:50, hapus semua log dari bulan lalu & sebelumnya ───
  // Waktu 00:50 dipilih supaya dijalankan setelah cron FINISH asia77 (00:30)
  // selesai dan sebelum fetch hourly (01:00) mulai.
  jobs.push(cron.schedule('50 0 1 * *', async () => {
    try {
      const deleted = await cleanLogsBeforeCurrentMonth();
      logger.info({ deleted }, 'Monthly log cleanup: logs from previous months deleted');
    } catch (err) {
      logger.error({ err: err.message }, 'Monthly log cleanup failed');
    }
  }, { timezone: defaultTz }));

  logger.info('Multi-tenant scheduler started');
}

export function stopScheduler() {
  for (const job of jobs) job.stop();
  jobs.length = 0;
}
