// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// 518 熊班 (formerly 518人力銀行). Public server-rendered listing, no auth.
// robots.txt (2026-08-25) allows everything and publishes a sitemap.
//
//   https://www.518.com.tw/job-index-P-{N}.html?ad=KEYWORD
//
// Wire in:
//
//   - name: 518熊班
//     provider: job518
//     job518:
//       keywords: ["軟體工程師"]
//     enabled: true

import { intInRange } from './_config-utils.mjs';
import { decodeEntities } from './_html-entities.mjs';
import { BROWSER_LIKE_USER_AGENT, fetchTextWithRetry } from './_http.mjs';
import { resolveProfileKeywords } from './_profile-keywords.mjs';

const SITE_ORIGIN = 'https://www.518.com.tw';
const TRUSTED_HOST = 'www.518.com.tw';
const DEFAULT_MAX_PAGES = 5;
const MAX_PAGES_CAP = 20;
const PAGE_DELAY_MS = 250;

const CARD_RE = /<div class="job__card[^"]*"([^>]*)>([\s\S]*?)<div class="job__actions">/gi;
const TITLE_RE = /<a href="(https:\/\/www\.518\.com\.tw\/job-[A-Za-z0-9]+\.html)"[^>]*class="job__title"[^>]*>([\s\S]*?)<\/a>/i;
const COMPANY_RE = /<span class="job__comp__name">([\s\S]*?)<\/span>/i;
const SUMMARY_LI_RE = /<ul class="job__summaries">\s*<li>([\s\S]*?)<\/li>/i;
const DATA_URL_RE = /data-url="(https:\/\/www\.518\.com\.tw\/job-[A-Za-z0-9]+\.html)"/i;

/** @param {any} ctx @param {number} ms */
function sleep(ctx, ms) {
  if (typeof ctx?.sleep === 'function') return ctx.sleep(ms);
  return new Promise((r) => setTimeout(r, ms));
}

/** @param {string} fragment */
export function visibleText(fragment) {
  return decodeEntities(
    String(fragment ?? '')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** @param {string} url */
export function assert518Url(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error(`job518: invalid URL: ${url}`); }
  if (parsed.protocol !== 'https:') throw new Error(`job518: URL must use HTTPS: ${url}`);
  if (parsed.hostname !== TRUSTED_HOST) throw new Error(`job518: untrusted host "${parsed.hostname}"`);
  return url;
}

/** @param {string} url */
export function cleanJobUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== TRUSTED_HOST) return '';
    if (!/^\/job-[A-Za-z0-9]+\.html$/.test(parsed.pathname)) return '';
    if (/^\/job-index/i.test(parsed.pathname)) return '';
    return `${SITE_ORIGIN}${parsed.pathname}`;
  } catch {
    return '';
  }
}

/**
 * @param {string} keyword
 * @param {number} page 1-based
 */
export function buildListUrl(keyword, page) {
  const url = new URL(`/job-index-P-${page}.html`, SITE_ORIGIN);
  url.searchParams.set('ad', keyword);
  return url.href;
}

/**
 * @param {string} html
 */
export function parseListingPage(html) {
  const out = [];
  const seen = new Set();
  const source = String(html ?? '');
  CARD_RE.lastIndex = 0;
  let m;
  while ((m = CARD_RE.exec(source))) {
    const attrs = m[1];
    const body = m[2];
    const titleM = TITLE_RE.exec(body);
    const title = titleM ? visibleText(titleM[2]) : '';
    const fromTitle = titleM ? cleanJobUrl(titleM[1]) : '';
    const fromData = DATA_URL_RE.exec(attrs);
    const url = fromTitle || (fromData ? cleanJobUrl(fromData[1]) : '');
    if (!title || !url || seen.has(url)) continue;
    seen.add(url);
    const co = COMPANY_RE.exec(body);
    const loc = SUMMARY_LI_RE.exec(body);
    out.push({
      title,
      url,
      company: co ? visibleText(co[1]) : '',
      location: loc ? visibleText(loc[1]) : '',
    });
  }
  return out;
}

/** @param {string} html @param {string} url */
export function assertParsedSomething(html, url) {
  if (!/class="job__card/i.test(String(html ?? ''))) return;
  throw new Error(`job518: ${url} still contains job cards but none could be parsed`);
}

/** @param {{ job518?: any, max_pages?: unknown }} entry */
export function parseConfig(entry) {
  const cfg = (entry && entry.job518) || {};
  const keywords = [...new Set(
    (Array.isArray(cfg.keywords) ? cfg.keywords : [])
      .filter((k) => typeof k === 'string' && k.trim())
      .map((k) => k.trim()),
  )];
  return {
    keywords,
    maxPages: intInRange(entry && entry.max_pages, DEFAULT_MAX_PAGES, 1, MAX_PAGES_CAP),
  };
}

/** @type {Provider} */
export default {
  id: 'job518',

  detect(entry) {
    if (entry?.provider === 'job518' || entry?.provider === '518') {
      return { url: `${SITE_ORIGIN}/job-index.html` };
    }
    let host;
    try { host = new URL(entry?.careers_url || '').hostname; } catch { return null; }
    return /(^|\.)518\.com\.tw$/i.test(host) ? { url: `${SITE_ORIGIN}/job-index.html` } : null;
  },

  async fetch(entry, ctx) {
    const cfg = parseConfig(entry);
    const keywords = cfg.keywords.length ? cfg.keywords : resolveProfileKeywords();
    if (!keywords.length) {
      throw new Error('job518: no keywords — set job518.keywords or config/profile.yml target_roles');
    }
    const maxPages = Math.min(cfg.maxPages, ctx?.maxPages ?? Number.POSITIVE_INFINITY);
    const out = [];
    const seen = new Set();

    for (const keyword of keywords) {
      for (let page = 1; page <= maxPages; page++) {
        if (page > 1 || out.length) await sleep(ctx, PAGE_DELAY_MS);
        const url = assert518Url(buildListUrl(keyword, page));
        const html = await fetchTextWithRetry(ctx, url, {
          headers: { 'User-Agent': BROWSER_LIKE_USER_AGENT },
          redirect: 'follow',
        });
        const parsed = parseListingPage(html);
        if (parsed.length === 0) {
          if (page === 1) assertParsedSomething(html, url);
          break;
        }
        const before = seen.size;
        for (const job of parsed) {
          if (seen.has(job.url)) continue;
          seen.add(job.url);
          out.push(job);
        }
        if (seen.size === before) break;
      }
    }
    return out;
  },
};
