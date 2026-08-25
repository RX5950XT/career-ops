// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// yes123 / 數字人力銀行 provider — Taiwanese generalist job board operated
// by 數字科技股份有限公司. Public server-rendered listing pages, no auth,
// no cookie, no Referer:
//
//   https://www.yes123.com.tw/wk_index/joblist.asp?find_key1=KEYWORD&strrec=N
//
// Wire in as a job_boards entry:
//
//   - name: 數字人力銀行 (yes123)
//     provider: yes123
//     yes123:
//       keywords: ["軟體工程師", "Python"]   # optional; falls back to profile.yml
//     enabled: true
//
// robots.txt (fetched 2026-08-25) disallows /commonAPI/, /WEBAPI/,
// /admin/CoreAPI/, /admin/corpapi/, member/enterprise account areas. It does
// NOT disallow /wk_index/joblist.asp or /wk_index/job.asp — those are the
// candidate-facing listing and posting pages this provider reads. The
// disallowed paths are APIs and employer/member dashboards; this provider
// never requests them.
//
// Pagination is GET `strrec` (0, 30, 60, …) — confirmed live 2026-08-25:
// strrec=0 and strrec=30 return distinct job_id sets. The board's own JS
// uses `(page-1)*30`. A keyword search for "python" reported 共90筆.
//
// PARSING CONTRACT. Markup-based extraction rots, so the anchors are the
// posting URL shape `job.asp?p_id={id}&job_id={id}` and the
// `Job_opening_item_title` / `Job_opening_item_info` pairing. No CSS colour
// or inline style is matched. When a page that still contains posting links
// parses to nothing, this THROWS instead of returning [] — a broken parser
// must look like a broken board, not like a quiet week.
//
// Employer attribution. Each card's <h6> names the real employer via
// comp_info.asp, not the aggregator's name.
//
// No postedAt. Listing cards show a relative month.day (e.g. "08.20") with
// no year. Per the Job contract, postedAt is omitted rather than guessed.

import { intInRange } from './_config-utils.mjs';
import { decodeEntities } from './_html-entities.mjs';
import { BROWSER_LIKE_USER_AGENT, fetchTextWithRetry } from './_http.mjs';
import { resolveProfileKeywords } from './_profile-keywords.mjs';

const SITE_ORIGIN = 'https://www.yes123.com.tw';
const LIST_PATH = '/wk_index/joblist.asp';
const TRUSTED_HOST = 'www.yes123.com.tw';
const PAGE_SIZE = 30;
const DEFAULT_MAX_PAGES = 5;
const MAX_PAGES_CAP = 20;
const PAGE_DELAY_MS = 250;

const JOB_HREF_RE = /href="(job\.asp\?p_id=([0-9_]+)&(?:amp;)?job_id=([0-9_]+))"/i;
const TITLE_BLOCK_RE = /<div class="Job_opening_item_title">([\s\S]*?)<div class="Job_opening_item_info">/gi;
const TITLE_ANCHOR_RE = /<h5>\s*<a href="job\.asp\?p_id=[^"]+"[^>]*>([\s\S]*?)<\/a>\s*<\/h5>/i;
const COMPANY_ANCHOR_RE = /<h6>\s*<a href="comp_info\.asp\?[^"]+"[^>]*>([\s\S]*?)<\/a>\s*<\/h6>/i;
const LOCATION_RE = /location_icon[\s\S]{0,400}?<span>([\s\S]*?)<\/span>/i;

/** @param {any} ctx @param {number} ms */
function sleep(ctx, ms) {
  if (typeof ctx?.sleep === 'function') return ctx.sleep(ms);
  return new Promise((r) => setTimeout(r, ms));
}

/** @param {string} url */
export function assertYes123Url(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`yes123: invalid URL: ${url}`);
  }
  if (parsed.protocol !== 'https:') throw new Error(`yes123: URL must use HTTPS: ${url}`);
  if (parsed.hostname !== TRUSTED_HOST) {
    throw new Error(`yes123: untrusted hostname "${parsed.hostname}" — must be ${TRUSTED_HOST}`);
  }
  if (!parsed.pathname.startsWith('/wk_index/')) {
    throw new Error(`yes123: path must stay under /wk_index/: ${parsed.pathname}`);
  }
  return url;
}

/**
 * Collapse a markup fragment to its visible text.
 * @param {string} fragment
 * @returns {string}
 */
export function visibleText(fragment) {
  return decodeEntities(
    String(fragment ?? '')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\u00a0/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Canonical posting URL. `rel` is the job.asp query as it appears in the
 * listing; protocol-relative / off-host / missing ids are rejected.
 * @param {string} rel
 * @returns {string}
 */
export function resolveYes123JobUrl(rel) {
  const raw = typeof rel === 'string' ? rel.trim() : '';
  if (!raw || raw.startsWith('//') || /^https?:/i.test(raw)) return '';
  if (!raw.startsWith('job.asp?')) return '';
  try {
    const parsed = new URL(raw, `${SITE_ORIGIN}/wk_index/`);
    if (parsed.protocol !== 'https:' || parsed.hostname !== TRUSTED_HOST) return '';
    if (parsed.pathname !== '/wk_index/job.asp') return '';
    if (!parsed.searchParams.get('p_id') || !parsed.searchParams.get('job_id')) return '';
    parsed.searchParams.delete('utm_source');
    parsed.searchParams.delete('utm_medium');
    parsed.searchParams.delete('utm_campaign');
    return parsed.href;
  } catch {
    return '';
  }
}

/**
 * @param {string} keyword
 * @param {number} offset
 */
export function buildListUrl(keyword, offset) {
  const url = new URL(LIST_PATH, SITE_ORIGIN);
  url.searchParams.set('find_key1', keyword);
  url.searchParams.set('strrec', String(offset));
  return url.href;
}

/**
 * Parse one listing page into postings. Exported for unit tests.
 * @param {string} html
 * @returns {{ title: string, url: string, company: string, location: string }[]}
 */
export function parseListingPage(html) {
  const out = [];
  const seen = new Set();
  const source = String(html ?? '');
  TITLE_BLOCK_RE.lastIndex = 0;
  let m;
  while ((m = TITLE_BLOCK_RE.exec(source))) {
    const titleBlock = m[1];
    // First inner </div> is the icon wrapper, not the card — take a bounded
    // window after Job_opening_item_info instead of cutting on the first close.
    const infoWindow = source.slice(m.index + m[0].length, m.index + m[0].length + 1200);
    const href = JOB_HREF_RE.exec(titleBlock);
    if (!href) continue;
    const titleMatch = TITLE_ANCHOR_RE.exec(titleBlock);
    const title = titleMatch ? visibleText(titleMatch[1]) : '';
    if (!title) continue;
    const url = resolveYes123JobUrl(href[1].replace(/&amp;/g, '&'));
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const co = COMPANY_ANCHOR_RE.exec(titleBlock);
    const company = co ? visibleText(co[1]) : '';
    const loc = LOCATION_RE.exec(infoWindow);
    const location = loc ? visibleText(loc[1]) : '';
    out.push({ title, url, company, location });
  }
  return out;
}

/**
 * @param {string} html
 * @param {string} url
 */
export function assertParsedSomething(html, url) {
  if (!/job\.asp\?p_id=/i.test(String(html ?? ''))) return;
  throw new Error(
    `yes123: ${url} still contains posting links but none could be parsed — the listing markup changed`,
  );
}

/**
 * @param {{ yes123?: any, max_pages?: unknown }} entry
 */
export function parseConfig(entry) {
  const cfg = (entry && entry.yes123) || {};
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
  id: 'yes123',

  detect(entry) {
    if (entry?.provider === 'yes123') return { url: `${SITE_ORIGIN}${LIST_PATH}` };
    let host;
    try { host = new URL(entry?.careers_url || '').hostname; } catch { return null; }
    return /(^|\.)yes123\.com\.tw$/i.test(host) ? { url: `${SITE_ORIGIN}${LIST_PATH}` } : null;
  },

  async fetch(entry, ctx) {
    const cfg = parseConfig(entry);
    const keywords = cfg.keywords.length ? cfg.keywords : resolveProfileKeywords();
    if (!keywords.length) {
      throw new Error(
        'yes123: no keywords — set yes123.keywords in portals.yml or target_roles in config/profile.yml',
      );
    }
    const maxPages = Math.min(cfg.maxPages, ctx?.maxPages ?? Number.POSITIVE_INFINITY);

    /** @type {any[]} */
    const out = [];
    const seen = new Set();

    for (const keyword of keywords) {
      for (let page = 0; page < maxPages; page++) {
        if (page > 0 || out.length) {
          await sleep(ctx, PAGE_DELAY_MS);
        }
        const url = assertYes123Url(buildListUrl(keyword, page * PAGE_SIZE));
        const html = await fetchTextWithRetry(ctx, url, {
          headers: { 'User-Agent': BROWSER_LIKE_USER_AGENT },
          redirect: 'follow',
        });
        const parsed = parseListingPage(html);
        if (parsed.length === 0) {
          if (page === 0) assertParsedSomething(html, url);
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
