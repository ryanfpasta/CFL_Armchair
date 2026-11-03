/* Browser acceptance tests (headless Chromium via Playwright). Run: node tests/ui.test.js */
const { chromium, devices } = require('playwright');
const path = require('path');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
let pass = 0, fail = 0;
function ok(c, n) { if (c) { pass++; console.log('ok  ', n); } else { fail++; console.log('FAIL', n); } }

async function setup(page, mode, t1, t2) {
  await page.click('#btn-newgame');
  if (mode === 'pnp') await page.click('#mode-seg input[value=pnp] + span');
  await page.click(`#grid-team1 [data-team=${t1}]`);
  await page.click(`#grid-team2 [data-team=${t2}]`);
  await page.click('#btn-start');
  await page.click('#coin-actions [data-call=H]');
  await page.click('#btn-coin-go');
}
async function playUntil(page, stopFn, maxClicks = 4000) {
  let clicks = 0, handovers = 0;
  while (clicks < maxClicks) {
    if (await stopFn()) break;
    if (await page.isVisible('#ov-handover')) { await page.click('#btn-handover'); handovers++; continue; }
    const btns = await page.$$('#buttons-pane .pbtn:not([disabled])');
    if (btns.length) { await btns[Math.floor(Math.random() * Math.min(btns.length, 6))].click(); clicks++; }
    await page.waitForTimeout(10);
  }
  return { clicks, handovers };
}
const state = page => page.evaluate(() => JSON.parse(JSON.stringify(CFL.ui.state())));

(async () => {
  const browser = await chromium.launch();
  const requests = [];

  // 1. Full solo game
  { const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    page.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) requests.push(r.url()); });
    await page.goto(URL + '?fast=1');
    await setup(page, 'solo', 'BC', 'CGY');
    let sawHalfKick = false, openRec = null;
    const r = await playUntil(page, async () => {
      const s = await state(page);
      if (openRec === null) openRec = s.openingReceiver;
      if (s.log.some(e => e.event === 'half')) sawHalfKick = true;
      return await page.isVisible('#ov-box');
    });
    const s = await state(page);
    const halfIdx = s.log.findIndex(e => e.event === 'half');
    const nextKick = s.log.slice(halfIdx + 1).find(e => /^Kickoff/.test(e.text));
    ok(s.phase === 'final', `solo game completes (${r.clicks} human calls, final ${s.teams[0]} ${s.score[0]}–${s.teams[1]} ${s.score[1]}${s.ot ? ' OT' : ''})`);
    ok(s.score[0] === s.stats[0].pts.reduce((a, b) => a + b) && s.score[1] === s.stats[1].pts.reduce((a, b) => a + b), 'scoreboard = points by quarter');
    ok(s.log.some(e => /End of the 1st/.test(e.text)) && s.log.some(e => /End of the 3rd/.test(e.text)) && halfIdx > 0, 'quarters and halftime logged');
    ok(nextKick && nextKick.team === openRec, 'second-half kickoff kicked by the opening receiver (other team receives)');
    ok(s.log.filter(e => e.event === 'warning').length === 2, '3-minute warning fired in Q2 and Q4');
    const hist = await page.evaluate(() => JSON.parse(localStorage.getItem('cflArmchair.history')));
    ok(hist && hist.length === 1 && hist[0].score[0] === s.score[0], 'completed game saved to history');
    ok(await page.evaluate(() => localStorage.getItem('cflArmchair.current')) === null, 'current save cleared after final');
    await page.click('#btn-again');
    const s2 = await state(page);
    ok(s2.phase === 'coin' && s2.teams.join() === s.teams.join(), 'Play Again starts the same teams');
    ok(errs.length === 0, 'no page errors: ' + errs.join('; '));
    await page.close();
  }

  // 2. Full pass-and-play game
  { const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(URL + '?fast=1');
    await setup(page, 'pnp', 'WPG', 'SSK');
    const r = await playUntil(page, () => page.isVisible('#ov-box'));
    const s = await state(page);
    const changes = s.log.filter((e, i, a) => e.team !== null).reduce((n, e, i, arr) => n + (i && e.team !== arr[i - 1].team ? 1 : 0), 0);
    ok(s.phase === 'final' && s.ctrl.join() === 'human,human', `pass-and-play game completes (${r.clicks} calls, ${r.handovers} device hand-overs, final ${s.score.join('–')})`);
    ok(r.handovers >= changes, 'hand-over screen shown at every change of the team calling plays');
    ok(errs.length === 0, 'no page errors');
    // history page lists both games
    await page.click('#btn-box-new');
    const items = await page.$$eval('#history-list li', l => l.length);
    ok(items >= 1, 'history visible on the setup screen');
    await page.close();
  }

  // 3. Save / resume
  { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(URL + '?fast=1');
    await setup(page, 'solo', 'MTL', 'OTT');
    await playUntil(page, async () => (await state(page)).seq >= 25);
    await page.waitForTimeout(100);
    const before = await state(page);
    await page.close();
    const page2 = await ctx.newPage();
    await page2.goto(URL + '?fast=1');
    ok(await page2.isVisible('#btn-resume'), 'Resume offered on reopen: ' + (await page2.textContent('#resume-summary')));
    await page2.click('#btn-resume');
    const after = await state(page2);
    const strip = x => { const c = Object.assign({}, x); delete c.uiLastActor; return JSON.stringify(c); };
    ok(strip(before) === strip(after), 'resumed state identical (score, clock, down, ball, stats, log)');
    await page2.goto(URL + '?fast=1'); await page2.click('#btn-newgame'); await page2.click('#btn-setup-back');
    ok(await page2.isVisible('#btn-resume'), 'starting setup without starting a game keeps the save');
    await ctx.close();
  }

  // 4. Layout on phone/desktop viewports
  const targets = [['iPhone SE', devices['iPhone SE']], ['iPhone 13', devices['iPhone 13']], ['Pixel 5', devices['Pixel 5']], ['Galaxy S9+', devices['Galaxy S9+']],
    ['Desktop 1280', { viewport: { width: 1280, height: 800 } }], ['Desktop 1920', { viewport: { width: 1920, height: 1080 } }]];
  for (const [name, dev] of targets) {
    const ctx = await browser.newContext(Object.assign({}, dev, { defaultBrowserType: undefined }));
    const page = await ctx.newPage();
    await page.goto(URL + '?fast=1');
    await setup(page, 'solo', 'TOR', 'HAM');
    await playUntil(page, async () => (await state(page)).seq >= 6);
    await page.waitForTimeout(900);
    const m = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('#buttons-pane .pbtn')].map(b => b.getBoundingClientRect());
      const die = document.getElementById('die1').getBoundingClientRect();
      const field = document.getElementById('field').getBoundingClientRect();
      return { sw: document.documentElement.scrollWidth, w: innerWidth, minH: Math.min(...btns.map(b => b.height)), minW: Math.min(...btns.map(b => b.width)), n: btns.length, die: die.width, fieldTall: field.height > field.width };
    });
    ok(m.sw <= m.w, `${name}: no horizontal scroll (${m.sw}/${m.w})`);
    ok(m.n === 0 || (m.minH >= 44 && m.minW >= 44), `${name}: play buttons thumb-sized (min ${Math.round(m.minW)}×${Math.round(m.minH)} px)`);
    ok(m.die >= 44, `${name}: dice readable (${Math.round(m.die)} px)`);
    ok(m.fieldTall, `${name}: field is vertical`);
    await page.screenshot({ path: path.join(process.argv[2] || '.', name.replace(/\W+/g, '_') + '.png') });
    await ctx.close();
  }
  ok(requests.length === 0, 'no network requests at runtime: ' + requests.join(', '));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
