// tests/providers/yes123.test.mjs
import { pass, fail, ROOT } from '../helpers.mjs';
import { join } from 'path';
import { pathToFileURL } from 'url';

console.log('\nProvider — yes123');

try {
  const mod = await import(pathToFileURL(join(ROOT, 'providers/yes123.mjs')).href);
  const yes123 = mod.default;
  const {
    parseListingPage,
    resolveYes123JobUrl,
    buildListUrl,
    assertYes123Url,
    assertParsedSomething,
    parseConfig,
    visibleText,
  } = mod;

  if (yes123.id === 'yes123') pass('yes123.id is "yes123"');
  else fail(`yes123.id is ${JSON.stringify(yes123.id)}`);

  if (yes123.detect({ provider: 'yes123' })?.url === 'https://www.yes123.com.tw/wk_index/joblist.asp') {
    pass('detect() claims an explicit provider: yes123 entry');
  } else {
    fail(`detect explicit = ${JSON.stringify(yes123.detect({ provider: 'yes123' }))}`);
  }
  if (yes123.detect({ careers_url: 'https://www.yes123.com.tw/wk_index/joblist.asp' })) {
    pass('detect() claims a yes123.com.tw careers_url');
  } else {
    fail('detect() missed yes123.com.tw careers_url');
  }
  if (yes123.detect({ careers_url: 'https://www.104.com.tw/jobs/search/' }) === null) {
    pass('detect() ignores a 104 URL');
  } else {
    fail('detect() claimed a 104 URL');
  }

  const ok = resolveYes123JobUrl('job.asp?p_id=20140103100924_27365925&job_id=20240627033111_35503672');
  if (ok === 'https://www.yes123.com.tw/wk_index/job.asp?p_id=20140103100924_27365925&job_id=20240627033111_35503672') {
    pass('resolveYes123JobUrl builds a host-locked /wk_index/job.asp URL');
  } else {
    fail(`resolveYes123JobUrl ok = ${JSON.stringify(ok)}`);
  }
  const rejects = [
    resolveYes123JobUrl('//evil.example/job.asp?p_id=1&job_id=2'),
    resolveYes123JobUrl('https://evil.example/job.asp?p_id=1&job_id=2'),
    resolveYes123JobUrl('comp_info.asp?p_id=1'),
    resolveYes123JobUrl('job.asp?p_id=1'),
    resolveYes123JobUrl(''),
  ];
  if (rejects.every((u) => u === '')) pass('resolveYes123JobUrl rejects off-host / incomplete hrefs');
  else fail(`resolveYes123JobUrl rejects = ${JSON.stringify(rejects)}`);

  const list = buildListUrl('軟體工程師', 30);
  if (list === 'https://www.yes123.com.tw/wk_index/joblist.asp?find_key1=%E8%BB%9F%E9%AB%94%E5%B7%A5%E7%A8%8B%E5%B8%AB&strrec=30') {
    pass('buildListUrl encodes the keyword and sets strrec');
  } else {
    fail(`buildListUrl = ${JSON.stringify(list)}`);
  }

  try {
    assertYes123Url('https://evil.example/wk_index/joblist.asp');
    fail('assertYes123Url accepted an off-host URL');
  } catch {
    pass('assertYes123Url rejects an off-host URL');
  }
  try {
    assertYes123Url('https://www.yes123.com.tw/admin/CoreAPI/x');
    fail('assertYes123Url accepted a robots-disallowed path');
  } catch {
    pass('assertYes123Url rejects paths outside /wk_index/');
  }

  const html = `
    <div class="Job_opening_item_title">
      <h5><a href="job.asp?p_id=20140103100924_27365925&job_id=20240627033111_35503672" target=_blank>A6000【momo Ads】資料工程師</a></h5>
      <h6><a href="comp_info.asp?p_id=20140103100924_27365925" target=_blank>富邦媒體科技股份有限公司</a></h6>
    </div>
    <div class="Job_opening_item_info">
      <div><div class="icon_commonStyle location_icon"></div></div>
      <span>台北市內湖區&nbsp;</span>
    </div>
    <div class="Job_opening_item_title">
      <h5><a href="job.asp?p_id=83151_04322046&amp;job_id=20260102033119_2446251">Python 後端</a></h5>
      <h6><a href="comp_info.asp?p_id=83151_04322046">測試公司</a></h6>
    </div>
    <div class="Job_opening_item_info">
      <div class="icon_commonStyle location_icon"></div>
      <span>新北市</span>
    </div>
  `;
  const parsed = parseListingPage(html);
  if (
    parsed.length === 2
    && parsed[0].title === 'A6000【momo Ads】資料工程師'
    && parsed[0].company === '富邦媒體科技股份有限公司'
    && parsed[0].location === '台北市內湖區'
    && parsed[0].url.includes('job_id=20240627033111_35503672')
    && parsed[1].title === 'Python 後端'
    && parsed[1].company === '測試公司'
  ) {
    pass('parseListingPage maps title/company/location and decodes &amp;');
  } else {
    fail(`parseListingPage = ${JSON.stringify(parsed)}`);
  }

  if (parseListingPage('<html>empty</html>').length === 0) {
    pass('parseListingPage returns [] on a page with no cards');
  } else {
    fail('parseListingPage should be empty');
  }

  let threw = false;
  try {
    assertParsedSomething('<a href="job.asp?p_id=1&job_id=2">x</a>', 'https://www.yes123.com.tw/wk_index/joblist.asp');
  } catch {
    threw = true;
  }
  if (threw) pass('assertParsedSomething throws when posting links exist but nothing parsed');
  else fail('assertParsedSomething did not throw');

  if (visibleText('  台北市&nbsp;內湖區  ') === '台北市 內湖區') {
    pass('visibleText collapses nbsp and whitespace');
  } else {
    fail(`visibleText = ${JSON.stringify(visibleText('  台北市&nbsp;內湖區  '))}`);
  }

  const cfg = parseConfig({ max_pages: 3, yes123: { keywords: [' Python ', '', 'Java'] } });
  if (cfg.maxPages === 3 && cfg.keywords.join(',') === 'Python,Java') {
    pass('parseConfig trims keywords and honours max_pages');
  } else {
    fail(`parseConfig = ${JSON.stringify(cfg)}`);
  }

  const pages = {
    0: html,
    30: `
      <div class="Job_opening_item_title">
        <h5><a href="job.asp?p_id=9_9&job_id=9_9">第三頁職缺</a></h5>
        <h6><a href="comp_info.asp?p_id=9_9">另一家</a></h6>
      </div>
      <div class="Job_opening_item_info"><div class="icon_commonStyle location_icon"></div><span>台中市</span></div>
    `,
    60: '<html>no more</html>',
  };
  const requested2 = [];
  const ctx = {
    transport: 'http',
    sleep: async () => {},
    maxPages: undefined,
    fetchText: async (url) => {
      requested2.push(url);
      const rec = Number(new URL(url).searchParams.get('strrec') || '0');
      return pages[rec] || '<html></html>';
    },
  };
  const fetched = await yes123.fetch({ name: 'yes123', yes123: { keywords: ['python'] }, max_pages: 5 }, ctx);
  if (
    fetched.length === 3
    && requested2[0].includes('find_key1=python')
    && requested2[0].includes('strrec=0')
    && requested2[1].includes('strrec=30')
    && requested2.length === 3
  ) {
    pass('yes123.fetch paginates strrec=0,30 and stops on an empty page');
  } else {
    fail(`yes123.fetch = ${JSON.stringify({ count: fetched.length, urls: requested2, titles: fetched.map((j) => j.title) })}`);
  }

  const probed = [];
  await yes123.fetch(
    { name: 'yes123', yes123: { keywords: ['python'] }, max_pages: 50 },
    {
      transport: 'http',
      maxPages: 1,
      sleep: async () => {},
      fetchText: async (url) => {
        probed.push(url);
        return html;
      },
    },
  );
  if (probed.length === 1) pass('yes123.fetch honours ctx.maxPages over entry.max_pages');
  else fail(`yes123.fetch probe requests = ${JSON.stringify(probed)}`);

  let noKw = false;
  try {
    await yes123.fetch({ name: 'yes123', yes123: { keywords: [] } }, {
      transport: 'http',
      sleep: async () => {},
      fetchText: async () => html,
    });
  } catch (err) {
    noKw = /no keywords/.test(String(err?.message || ''));
  }
  if (noKw) pass('yes123.fetch throws when no keywords and no profile fallback');
  else fail('yes123.fetch did not throw on empty keywords');
} catch (e) {
  fail(`yes123 provider test crashed: ${e?.message}`);
}
