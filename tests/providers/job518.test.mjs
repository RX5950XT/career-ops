import { pass, fail, ROOT } from '../helpers.mjs';
import { join } from 'path';
import { pathToFileURL } from 'url';

console.log('\nProvider — job518');

try {
  const mod = await import(pathToFileURL(join(ROOT, 'providers/job518.mjs')).href);
  const p = mod.default;
  const { parseListingPage, cleanJobUrl, buildListUrl, parseConfig } = mod;

  if (p.id === 'job518') pass('job518.id');
  else fail(`id=${p.id}`);
  if (p.detect({ provider: '518' })) pass('detect alias 518');
  else fail('detect 518 alias');
  if (p.detect({ careers_url: 'https://www.518.com.tw/job-index.html' })) pass('detect host');
  else fail('detect host');

  if (cleanJobUrl('https://www.518.com.tw/job-yllOBq.html') === 'https://www.518.com.tw/job-yllOBq.html') {
    pass('cleanJobUrl');
  } else fail('cleanJobUrl good');
  if (cleanJobUrl('https://www.518.com.tw/job-index.html') === '') pass('cleanJobUrl rejects index');
  else fail('cleanJobUrl index leaked');

  const list = buildListUrl('python', 2);
  if (list === 'https://www.518.com.tw/job-index-P-2.html?ad=python') pass('buildListUrl');
  else fail(`buildListUrl=${list}`);

  const html = `
    <div class="job__card  " data-id="yllOBq" data-url="https://www.518.com.tw/job-yllOBq.html">
      <a href="https://www.518.com.tw/job-yllOBq.html" class="job__title">【週末】程式教育老師</a>
      <span class="job__comp__name">蘋果芽數位科技股份有限公司</span>
      <ul class="job__summaries"><li>高雄市-左營區</li><li>經歷不拘</li></ul>
      <div class="job__actions"></div>
    </div>
    <div class="job__card" data-url="https://evil.example/job-x.html">
      <a href="https://evil.example/job-x.html" class="job__title">壞掉</a>
      <div class="job__actions"></div>
    </div>
  `;
  const rows = parseListingPage(html);
  if (
    rows.length === 1
    && rows[0].title === '【週末】程式教育老師'
    && rows[0].company.includes('蘋果芽')
    && rows[0].location === '高雄市-左營區'
    && rows[0].url === 'https://www.518.com.tw/job-yllOBq.html'
  ) {
    pass('parseListingPage maps card and drops off-host');
  } else {
    fail(`parse=${JSON.stringify(rows)}`);
  }

  const cfg = parseConfig({ max_pages: 2, job518: { keywords: [' Python ', ''] } });
  if (cfg.maxPages === 2 && cfg.keywords.join() === 'Python') pass('parseConfig');
  else fail(`cfg=${JSON.stringify(cfg)}`);

  const requested = [];
  const pages = {
    1: html,
    2: '<html>empty</html>',
  };
  const jobs = await p.fetch(
    { job518: { keywords: ['python'] }, max_pages: 5 },
    {
      transport: 'http',
      sleep: async () => {},
      fetchText: async (url) => {
        requested.push(url);
        const page = Number((/P-(\d+)/.exec(url) || [])[1] || 0);
        return pages[page] || '<html></html>';
      },
    },
  );
  if (jobs.length === 1 && requested.length === 2 && requested[0].includes('ad=python')) {
    pass('fetch paginates and stops on empty page');
  } else {
    fail(`fetch=${JSON.stringify({ n: jobs.length, requested })}`);
  }
} catch (e) {
  fail(`job518 test crashed: ${e?.message}`);
}
