import { pass, fail, ROOT } from '../helpers.mjs';
import { join } from 'path';
import { pathToFileURL } from 'url';

console.log('\nProvider — taiwanjobs');

try {
  const mod = await import(pathToFileURL(join(ROOT, 'providers/taiwanjobs.mjs')).href);
  const p = mod.default;
  const { parseWebserviceXml, normalizeRecord, cleanJobUrl, buildFeedUrl, parseConfig, xmlField } = mod;

  if (p.id === 'taiwanjobs') pass('taiwanjobs.id');
  else fail(`id=${p.id}`);

  if (p.detect({ provider: 'taiwanjobs' })) pass('detect explicit');
  else fail('detect explicit missed');
  if (p.detect({ careers_url: 'https://www.taiwanjobs.gov.tw/' })) pass('detect host');
  else fail('detect host missed');
  if (p.detect({ careers_url: 'https://www.104.com.tw/' }) === null) pass('detect ignores 104');
  else fail('detect claimed 104');

  if (cleanJobUrl('https://job.taiwanjobs.gov.tw/Internet/jobwanted/JobDetail.aspx?EMPLOYER_ID=1&HIRE_ID=2').includes('HIRE_ID=2')) {
    pass('cleanJobUrl accepts job.taiwanjobs.gov.tw');
  } else fail('cleanJobUrl good url');
  if (cleanJobUrl('https://evil.example/x') === '') pass('cleanJobUrl rejects off-host');
  else fail('cleanJobUrl leaked');

  const xml = `<?xml version='1.0' ?><DataList>
<Data>
<OCCU_DESC（職務名稱）><![CDATA[軟體工程師]]></OCCU_DESC（職務名稱）>
<COMPNAME（公司名稱）><![CDATA[測試公司]]></COMPNAME（公司名稱）>
<CITYNAME（工作地點）><![CDATA[台北市中正區]]></CITYNAME（工作地點）>
<URL_QUERY（職缺資料URL）><![CDATA[https://job.taiwanjobs.gov.tw/Internet/jobwanted/JobDetail.aspx?EMPLOYER_ID=1&HIRE_ID=9]]></URL_QUERY（職缺資料URL）>
<TRANDATE（職缺更新日期）><![CDATA[20260820]]></TRANDATE（職缺更新日期）>
</Data>
<Data>
<OCCU_DESC（職務名稱）><![CDATA[無網址]]></OCCU_DESC（職務名稱）>
<URL_QUERY（職缺資料URL）><![CDATA[]]></URL_QUERY（職缺資料URL）>
</Data>
</DataList>`;
  const rows = parseWebserviceXml(xml);
  if (
    rows.length === 1
    && rows[0].title === '軟體工程師'
    && rows[0].company === '測試公司'
    && rows[0].location === '台北市中正區'
    && rows[0].url.includes('HIRE_ID=9')
    && Number.isFinite(rows[0].postedAt)
  ) {
    pass('parseWebserviceXml maps CDATA fields and drops url-less rows');
  } else {
    fail(`parse=${JSON.stringify(rows)}`);
  }

  const url = buildFeedUrl('104', 10);
  if (url === 'https://free.taiwanjobs.gov.tw/webservice_taipei/Webservice.ashx?zipno=104&count=10') {
    pass('buildFeedUrl');
  } else fail(`buildFeedUrl=${url}`);

  const cfg = parseConfig({ taiwanjobs: { zips: ['104', 'xx', '220'], count: 50 } });
  if (cfg.zips.join(',') === '104,220' && cfg.count === 50) pass('parseConfig sanitizes zips');
  else fail(`cfg=${JSON.stringify(cfg)}`);

  const requested = [];
  const jobs = await p.fetch(
    { name: '台灣就業通', taiwanjobs: { zips: ['100', '105'], count: 10 } },
    {
      transport: 'http',
      maxPages: 1,
      sleep: async () => {},
      fetchText: async (u) => {
        requested.push(u);
        return xml;
      },
    },
  );
  if (requested.length === 1 && jobs.length === 1) pass('fetch honours ctx.maxPages as zip cap');
  else fail(`fetch probe ${JSON.stringify({ requested, n: jobs.length })}`);

  if (xmlField(xml, 'OCCU_DESC') === '軟體工程師') pass('xmlField first-match');
  else fail(`xmlField=${xmlField(xml, 'OCCU_DESC')}`);
} catch (e) {
  fail(`taiwanjobs test crashed: ${e?.message}`);
}
