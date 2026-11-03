const { chromium } = require('playwright');
const path = require('path');
const SP = process.argv[2];
(async () => {
  const browser = await chromium.launch();
  for (const [w,h,name] of [[390,844,'phone'],[360,640,'small'],[1280,800,'desktop']]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await page.goto('file://' + path.resolve('index.html') + '?fast=1');
    await page.click('#btn-newgame');
    await page.screenshot({ path: `${SP}/${name}-setup.png`, fullPage: true });
    await page.click('#grid-team1 [data-team=TOR]'); await page.click('#grid-team2 [data-team=HAM]');
    await page.click('#btn-start'); await page.click('#coin-actions [data-call=H]'); await page.click('#btn-coin-go');
    for (let i=0;i<12;i++){ const b = await page.$$('#buttons-pane .pbtn:not([disabled])'); if(b.length) await b[Math.min(2,b.length-1)].click(); await page.waitForTimeout(60); }
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SP}/${name}-game.png` });
    const sw = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    console.log(name, 'scrollWidth/innerWidth', sw);
    await page.close();
  }
  await browser.close();
})();
