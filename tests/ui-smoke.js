const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.resolve(process.env.APP || 'index.html') + '?fast=1');
  await page.click('#btn-newgame');
  await page.click('#grid-team1 [data-team=BC]');
  await page.click('#grid-team2 [data-team=CGY]');
  await page.click('#btn-start');
  await page.click('#coin-actions [data-call=H]');
  await page.click('#btn-coin-go');
  let clicks = 0;
  while (clicks < 3000) {
    if (await page.isVisible('#ov-box')) break;
    const btns = await page.$$('#buttons-pane .pbtn:not([disabled])');
    if (btns.length) { const b = btns[Math.floor(Math.random() * Math.min(btns.length, 6))]; await b.click(); clicks++; }
    await page.waitForTimeout(15);
  }
  const st = await page.evaluate(() => { const s = CFL.ui.state(); return { phase: s.phase, score: s.score, q: s.quarter, plays: s.log.length }; });
  console.log('clicks', clicks, st, 'errors', errors);
  await page.screenshot({ path: '/tmp/claude-0/-home-claude/6c7a315c-1085-5ee8-bad2-7e58c0a7141c/scratchpad/final.png', fullPage: true });
  await browser.close();
})();
