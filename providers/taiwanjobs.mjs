// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// taiwanjobs / 台灣就業通 — 勞動部勞動力發展署 public employment service.
// Same class as arbeitsagentur / vdab / jobbankca: a government job bank,
// no login, no API key. Official open-data note (dataset 44062, checked
// 2026-08-25): each query returns at most 1000 rows.
//
//   https://free.taiwanjobs.gov.tw/webservice_taipei/Webservice.ashx?zipno=104&count=1000
//
// Wire in as a job_boards entry:
//
//   - name: 台灣就業通
//     provider: taiwanjobs
//     taiwanjobs:
//       zips: ["100", "105", "220", "330"]   # optional 3-digit 郵遞區號
//     enabled: true
//
// The dump at apiservice.mol.gov.tw is capped at 1000 rows total, so this
// provider walks 3-digit zip codes instead (the API's own documented
// dimension) and lets scan.mjs title/location filters decide. DEFAULT_ZIPS
// covers the major metro 3-digit prefixes; it is not the whole country.
//
// Job URLs come from URL_QUERY and are host-locked to job.taiwanjobs.gov.tw.

import { intInRange } from './_config-utils.mjs';
import { decodeEntities } from './_html-entities.mjs';
import { fetchTextWithRetry } from './_http.mjs';

const FEED_ORIGIN = 'https://free.taiwanjobs.gov.tw';
const FEED_PATH = '/webservice_taipei/Webservice.ashx';
const TRUSTED_FEED_HOST = 'free.taiwanjobs.gov.tw';
const TRUSTED_JOB_HOST = 'job.taiwanjobs.gov.tw';
const DEFAULT_COUNT = 1000;
const COUNT_CAP = 1000;
const PAGE_DELAY_MS = 300;

// Major-metro 3-digit zip prefixes. Not a complete national inventory —
// documented as such. Override with taiwanjobs.zips.
const DEFAULT_ZIPS = [
  '100', '105', '110', '114',
  '220', '231', '235',
  '300', '302', '330',
  '400', '407',
  '700', '710',
  '800', '806',
];

/** @param {any} ctx @param {number} ms */
function sleep(ctx, ms) {
  if (typeof ctx?.sleep === 'function') return ctx.sleep(ms);
  return new Promise((r) => setTimeout(r, ms));
}

/** @param {string} url */
export function assertFeedUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error(`taiwanjobs: invalid URL: ${url}`); }
  if (parsed.protocol !== 'https:') throw new Error(`taiwanjobs: URL must use HTTPS: ${url}`);
  if (parsed.hostname !== TRUSTED_FEED_HOST) {
    throw new Error(`taiwanjobs: untrusted feed host "${parsed.hostname}"`);
  }
  if (parsed.pathname !== FEED_PATH) throw new Error(`taiwanjobs: unexpected path ${parsed.pathname}`);
  return url;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function cleanJobUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'https:'
      && parsed.hostname === TRUSTED_JOB_HOST
      && parsed.port === ''
      && parsed.username === ''
      && parsed.password === ''
      ? parsed.href
      : '';
  } catch {
    return '';
  }
}

/**
 * Pull one field whose tag starts with `prefix` (tags carry a Chinese gloss).
 * @param {string} block
 * @param {string} prefix
 */
export function xmlField(block, prefix) {
  const re = new RegExp(
    `<${prefix}[^>]*>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*</`,
    'i',
  );
  const m = re.exec(block);
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : '';
}

/**
 * @param {string} block
 * @returns {{ title: string, url: string, company: string, location: string, postedAt?: number } | null}
 */
export function normalizeRecord(block) {
  const title = xmlField(block, 'OCCU_DESC');
  const url = cleanJobUrl(xmlField(block, 'URL_QUERY'));
  if (!title || !url) return null;
  const company = xmlField(block, 'COMPNAME');
  const location = xmlField(block, 'CITYNAME');
  /** @type {{ title: string, url: string, company: string, location: string, postedAt?: number }} */
  const job = { title, url, company, location };
  const rawDate = xmlField(block, 'TRANDATE'); // YYYYMMDD
  if (/^\d{8}$/.test(rawDate)) {
    const ms = Date.parse(`${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}T00:00:00+08:00`);
    if (Number.isFinite(ms)) job.postedAt = ms;
  }
  return job;
}

/**
 * @param {string} xml
 */
export function parseWebserviceXml(xml) {
  const blocks = String(xml ?? '').split(/<Data\b/i).slice(1);
  const out = [];
  for (const block of blocks) {
    const job = normalizeRecord(block);
    if (job) out.push(job);
  }
  return out;
}

/**
 * @param {string} zip
 * @param {number} count
 */
export function buildFeedUrl(zip, count) {
  const url = new URL(FEED_PATH, FEED_ORIGIN);
  url.searchParams.set('zipno', zip);
  url.searchParams.set('count', String(count));
  return url.href;
}

/**
 * @param {{ taiwanjobs?: any }} entry
 */
export function parseConfig(entry) {
  const cfg = (entry && entry.taiwanjobs) || {};
  const zips = [...new Set(
    (Array.isArray(cfg.zips) ? cfg.zips : DEFAULT_ZIPS)
      .map((z) => String(z ?? '').trim())
      .filter((z) => /^\d{3}$/.test(z)),
  )];
  return {
    zips,
    count: intInRange(cfg.count, DEFAULT_COUNT, 1, COUNT_CAP),
  };
}

/** @type {Provider} */
export default {
  id: 'taiwanjobs',

  detect(entry) {
    if (entry?.provider === 'taiwanjobs') return { url: `${FEED_ORIGIN}${FEED_PATH}` };
    let host;
    try { host = new URL(entry?.careers_url || '').hostname; } catch { return null; }
    return /(^|\.)taiwanjobs\.gov\.tw$/i.test(host) ? { url: `${FEED_ORIGIN}${FEED_PATH}` } : null;
  },

  async fetch(entry, ctx) {
    const cfg = parseConfig(entry);
    if (!cfg.zips.length) throw new Error('taiwanjobs: no valid 3-digit zips');
    const maxZips = Math.min(cfg.zips.length, ctx?.maxPages ?? Number.POSITIVE_INFINITY);

    /** @type {any[]} */
    const out = [];
    const seen = new Set();

    for (let i = 0; i < maxZips; i++) {
      if (i > 0) await sleep(ctx, PAGE_DELAY_MS);
      const url = assertFeedUrl(buildFeedUrl(cfg.zips[i], cfg.count));
      const xml = await fetchTextWithRetry(ctx, url, { redirect: 'error' });
      if (i === 0 && !/<Data\b/i.test(xml)) {
        throw new Error(`taiwanjobs: unexpected payload for zip ${cfg.zips[i]} — no <Data> nodes`);
      }
      for (const job of parseWebserviceXml(xml)) {
        if (seen.has(job.url)) continue;
        seen.add(job.url);
        out.push(job);
      }
    }
    return out;
  },
};
