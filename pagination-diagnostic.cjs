#!/usr/bin/env node

const { chromium } = require('playwright');

const BASE = 'https://www.endurancepromotions.com';
const DEFAULT_URL = `${BASE}/ResultDetails.aspx?id=1723`;

function clean(v) {
  return String(v ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function decode(v) {
  return String(v || '')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function parseArgs(argv) {
  const out = {
    url: DEFAULT_URL,
    page: 2,
    timeout: 30000,
    headed: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--url') out.url = argv[++i] || out.url;
    else if (arg === '--page') out.page = Math.max(2, Number(argv[++i]) || 2);
    else if (arg === '--timeout') out.timeout = Math.max(5000, Number(argv[++i]) || out.timeout);
    else if (arg === '--headed') out.headed = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`
Endurance Promotions pagination diagnostic

Usage:
  node pagination-diagnostic.cjs
  node pagination-diagnostic.cjs --url "https://www.endurancepromotions.com/ResultDetails.aspx?id=1723"
  node pagination-diagnostic.cjs --page 2
  node pagination-diagnostic.cjs --headed

This is diagnostic-only. It does NOT modify scraper.cjs or results.json.
`);
      process.exit(0);
    }
  }
  return out;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch({ headless: !a.headed });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const requests = [];
  const responses = [];
  const consoleMessages = [];
  const pageErrors = [];

  page.on('request', req => {
    if (req.url().includes('ResultDetails.aspx')) {
      requests.push({
        method: req.method(),
        url: req.url(),
        resourceType: req.resourceType(),
        postData: req.postData() || '',
      });
      console.log(`NETWORK REQUEST: ${req.method()} ${req.url()}`);
      if (req.postData()) {
        console.log('--- POST DATA ---');
        console.log(req.postData());
        console.log('--- END POST DATA ---');
      }
    }
  });

  page.on('response', async res => {
    if (!res.url().includes('ResultDetails.aspx')) return;
    responses.push({
      status: res.status(),
      url: res.url(),
      requestMethod: res.request().method(),
      contentType: res.headers()['content-type'] || '',
    });
    console.log(`NETWORK RESPONSE: ${res.status()} ${res.request().method()} ${res.url()}`);
  });

  page.on('console', msg => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
  });

  page.on('pageerror', err => {
    pageErrors.push(String(err));
    console.log(`PAGE ERROR: ${err}`);
  });

  console.log('========================================');
  console.log('ENDURANCE PROMOTIONS PAGINATION DIAGNOSTIC');
  console.log('========================================');
  console.log(`TARGET: ${a.url}`);
  console.log(`REQUESTED NEXT PAGE: ${a.page}`);
  console.log('DIAGNOSTIC ONLY: scraper.cjs/results.json will NOT be changed.');
  console.log('');

  await page.goto(a.url, { waitUntil: 'domcontentloaded', timeout: a.timeout });
  await page.waitForTimeout(1000);

  const initial = await page.evaluate(() => {
    const clean = v => String(v ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const parsePostback = value => {
      const decoded = String(value || '')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/&amp;/gi, '&');
      const m = decoded.match(/__doPostBack\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]\s*\)/i);
      return m ? { target: m[1], argument: m[2] } : null;
    };

    const hidden = [...document.querySelectorAll('input[type="hidden"]')].map(el => ({
      name: el.name || '',
      id: el.id || '',
      value: el.value || '',
      valueLength: (el.value || '').length,
    }));

    const pagerCandidates = [];
    const elements = [...document.querySelectorAll('a, input, button, select, span')];

    for (const el of elements) {
      const text = clean(el.textContent);
      const value = clean(el.getAttribute('value') || '');
      const href = el.getAttribute('href') || '';
      const onclick = el.getAttribute('onclick') || '';
      const oncommand = el.getAttribute('oncommand') || '';
      const post = parsePostback(`${href} ${onclick} ${oncommand}`);
      const looksLikePageNumber = text === '1' || text === '2' || text === '3' || text === '4' || value === '1' || value === '2' || value === '3' || value === '4';
      const mentionsPage = /Page\$\d+/i.test(`${href} ${onclick} ${oncommand}`);
      if (looksLikePageNumber || mentionsPage) {
        pagerCandidates.push({
          tag: el.tagName,
          id: el.id || '',
          name: el.getAttribute('name') || '',
          className: el.className || '',
          text,
          value,
          href,
          onclick,
          oncommand,
          postback: post,
          outerHTML: el.outerHTML.slice(0, 2000),
        });
      }
    }

    const tables = [...document.querySelectorAll('table')].map((table, index) => {
      const rows = [...table.querySelectorAll('tr')];
      return {
        index,
        rowCount: rows.length,
        text: clean(table.innerText).slice(0, 3000),
        firstRows: rows.slice(0, 5).map(r => clean(r.innerText)),
      };
    }).sort((a, b) => b.rowCount - a.rowCount);

    return {
      url: location.href,
      title: document.title,
      bodyTextStart: clean(document.body.innerText).slice(0, 5000),
      hidden,
      pagerCandidates,
      tables: tables.slice(0, 8),
    };
  });

  console.log('--- INITIAL PAGE ---');
  console.log(`Loaded URL: ${initial.url}`);
  console.log(`Title: ${initial.title}`);
  console.log('');
  console.log('HIDDEN ASP.NET FIELDS:');
  for (const field of initial.hidden) {
    console.log(`  ${field.name || '(no name)'} id=${field.id} length=${field.valueLength}`);
  }

  console.log('');
  console.log('PAGER CANDIDATES:');
  if (!initial.pagerCandidates.length) {
    console.log('  NONE FOUND');
  } else {
    for (const [i, c] of initial.pagerCandidates.entries()) {
      console.log(`  [${i}] <${c.tag}> text="${c.text}" value="${c.value}"`);
      console.log(`      id="${c.id}" name="${c.name}"`);
      console.log(`      href=${c.href}`);
      console.log(`      onclick=${c.onclick}`);
      console.log(`      oncommand=${c.oncommand}`);
      if (c.postback) console.log(`      POSTBACK target=${c.postback.target} argument=${c.postback.argument}`);
      console.log(`      HTML=${c.outerHTML}`);
    }
  }

  console.log('');
  console.log('LARGEST TABLES BEFORE CLICK:');
  for (const t of initial.tables.slice(0, 3)) {
    console.log(`  table ${t.index}: ${t.rowCount} rows`);
    console.log(`    ${t.firstRows.join(' || ')}`);
  }

  const target = String(a.page);
  const targetInfo = await page.evaluate((wanted) => {
    const clean = v => String(v ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const els = [...document.querySelectorAll('a, input, button')];
    const matches = els.filter(el => clean(el.textContent) === wanted || clean(el.getAttribute('value') || '') === wanted);
    return matches.map(el => ({
      tag: el.tagName,
      id: el.id || '',
      name: el.getAttribute('name') || '',
      type: el.getAttribute('type') || '',
      text: clean(el.textContent),
      value: clean(el.getAttribute('value') || ''),
      href: el.getAttribute('href') || '',
      onclick: el.getAttribute('onclick') || '',
      oncommand: el.getAttribute('oncommand') || '',
      outerHTML: el.outerHTML.slice(0, 3000),
    }));
  }, target);

  console.log('');
  console.log(`--- LIVE CONTROL MATCHES FOR PAGE ${target} ---`);
  if (!targetInfo.length) {
    console.log('NO DIRECT PAGE-NUMBER CONTROL FOUND.');
  } else {
    for (const [i, c] of targetInfo.entries()) {
      console.log(`  [${i}] ${c.outerHTML}`);
    }
  }

  const beforeUrl = page.url();
  const beforeSnapshot = await page.evaluate(() => {
    const tables = [...document.querySelectorAll('table')].map((t, i) => ({
      index: i,
      rows: [...t.querySelectorAll('tr')].map(r => (r.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean),
    })).sort((a, b) => b.rows.length - a.rows.length);
    const main = tables[0]?.rows || [];
    return {
      mainFirst10: main.slice(0, 10),
      mainLast10: main.slice(-10),
      mainRowCount: main.length,
      bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').trim(),
    };
  });

  console.log('');
  console.log(`--- CLICKING PAGE ${target} ---`);
  console.log(`Before URL: ${beforeUrl}`);

  requests.length = 0;
  responses.length = 0;

  let clickError = null;
  try {
    await page.evaluate((wanted) => {
      const clean = v => String(v ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
      const els = [...document.querySelectorAll('a, input, button')];
      const el = els.find(node => clean(node.textContent) === wanted || clean(node.getAttribute('value') || '') === wanted);
      if (!el) throw new Error(`Could not find page ${wanted} control`);
      el.click();
    }, target);
  } catch (err) {
    clickError = String(err);
    console.log(`CLICK ERROR: ${clickError}`);
  }

  if (!clickError) {
    try {
      await page.waitForLoadState('networkidle', { timeout: Math.min(a.timeout, 12000) });
    } catch {}
    await page.waitForTimeout(1200);
  }

  const after = await page.evaluate(() => {
    const clean = v => String(v ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const tables = [...document.querySelectorAll('table')].map((t, i) => ({
      index: i,
      rowCount: t.querySelectorAll('tr').length,
      rows: [...t.querySelectorAll('tr')].map(r => clean(r.innerText)).filter(Boolean),
      text: clean(t.innerText).slice(0, 3000),
    })).sort((a, b) => b.rowCount - a.rowCount);
    const main = tables[0]?.rows || [];
    const body = clean(document.body.innerText);
    const hidden = [...document.querySelectorAll('input[type="hidden"]')].map(el => ({
      name: el.name || '',
      value: el.value || '',
      valueLength: (el.value || '').length,
    }));
    return {
      url: location.href,
      title: document.title,
      mainRowCount: main.length,
      mainFirst10: main.slice(0, 10),
      mainLast10: main.slice(-10),
      bodyText: body.slice(0, 5000),
      hidden,
    };
  });

  console.log('');
  console.log('--- AFTER CLICK ---');
  console.log(`After URL: ${after.url}`);
  console.log(`Main table rows: ${after.mainRowCount}`);
  console.log(`First rows: ${after.mainFirst10.join(' || ')}`);
  console.log(`Last rows: ${after.mainLast10.join(' || ')}`);

  console.log('');
  console.log('--- NETWORK REQUESTS DURING CLICK ---');
  if (!requests.length) console.log('NONE');
  for (const req of requests) {
    console.log(`METHOD: ${req.method}`);
    console.log(`URL: ${req.url}`);
    console.log(`RESOURCE TYPE: ${req.resourceType}`);
    if (req.postData) {
      console.log('POST DATA:');
      console.log(req.postData);
    }
    console.log('---');
  }

  console.log('');
  console.log('--- NETWORK RESPONSES DURING CLICK ---');
  for (const res of responses) {
    console.log(`${res.status} ${res.requestMethod} ${res.url} (${res.contentType})`);
  }

  const comparison = await page.evaluate(({beforeRows, afterRows}) => ({
    sameFirst10: JSON.stringify(beforeRows) === JSON.stringify(afterRows),
    firstDifferentIndex: (() => {
      const n = Math.min(beforeRows.length, afterRows.length);
      for (let i = 0; i < n; i++) {
        if (beforeRows[i] !== afterRows[i]) return i;
      }
      return beforeRows.length === afterRows.length ? -1 : n;
    })(),
  }), { beforeRows: beforeSnapshot.mainFirst10, afterRows: after.mainFirst10 });

  console.log('');
  console.log('--- RESULT ---');
  console.log(`Same first 10 rows before/after: ${comparison.sameFirst10}`);
  console.log(`First differing row index: ${comparison.firstDifferentIndex}`);
  console.log(`Page URL changed: ${beforeUrl !== after.url}`);
  console.log(`Page errors observed: ${pageErrors.length}`);
  console.log('');
  console.log('If the page URL stays the same but the rows change, that confirms pagination is driven by postback/form state.');
  console.log('The network request and POST DATA above are the exact mechanism we need to reproduce in the scraper.');

  await browser.close();
}

main().catch(err => {
  console.error(err?.stack || err);
  process.exitCode = 1;
});
