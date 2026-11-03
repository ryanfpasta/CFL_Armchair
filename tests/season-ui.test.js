/* Season mode in the browser (headless Chromium). Run: node tests/season-ui.test.js [screenshot-dir] */
const { chromium } = require('playwright');
const path = require('path');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html') + '?fast=1';
const OUT = process.argv[2];
let pass = 0, fail = 0;
function ok(c, n) { if (c) { pass++; console.log('ok  ', n); } else { fail++; console.log('FAIL', n); } }
const season = page => page.evaluate(() => JSON.parse(JSON.stringify(CFL.ui.season())));
const shot = (page, name) => OUT ? page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true }) : null;

async function playHumanGame(page) {
  await page.click('#btn-play');
  await page.click('#coin-actions [data-call=H]');
  await page.click('#btn-coin-go');
  let n = 0;
  while (!(await page.isVisible('#ov-box')) && n < 4000) {
    const btns = await page.$$('#buttons-pane .pbtn:not([disabled])');
    if (btns.length) { await btns[Math.floor(Math.random() * Math.min(btns.length, 6))].click(); n++; }
    await page.waitForTimeout(5);
  }
}
async function noOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(URL);

  // Start a season
  ok((await page.textContent('#btn-season')) === 'Season Mode', 'start screen offers Season Mode');
  await page.click('#btn-season');
  ok(await page.isVisible('#screen-season-setup'), 'season setup opens');
  await page.click('#btn-ss-start');
  ok((await page.textContent('#ss-warn')).includes('Pick a team'), 'must pick a team');
  await page.click('[data-ss=SSK]');
  await page.click('#btn-ss-start');
  ok(await page.isVisible('#screen-season'), 'season hub opens');
  let sv = await season(page);
  ok(sv.team === 'SSK' && sv.week === 1 && sv.weeks.length === 21, 'season created for SSK, week 1 of 21');
  await shot(page, 'hub-week1');
  ok(await noOverflow(page), 'hub fits a phone screen');

  // Play (or bye) through the first weeks, playing the first real game by hand.
  let played = false, guard = 0;
  while (!played && guard++ < 5) {
    if (await page.isVisible('#btn-play')) {
      await playHumanGame(page);
      const st = await page.evaluate(() => JSON.parse(JSON.stringify(CFL.ui.state())));
      ok(st.phase === 'final' && !!st.seasonGame, 'season game played to a final');
      ok(await page.isVisible('#btn-box-season') && !(await page.isVisible('#btn-again')), 'box score offers Back to Season');
      ok(await page.evaluate(() => localStorage.getItem('cflArmchair.current')) === null, 'season game does not touch the single-game save');
      await page.click('#btn-box-season');
      played = true;
    } else {
      await page.click('#btn-sim-week');
    }
    ok(await page.isVisible('#ov-week'), 'week results shown');
    await shot(page, 'week-results');
    const rows = await page.$$eval('#week-body .gline', r => r.length);
    sv = await season(page);
    const wk = sv.weeks[sv.week - 1];
    ok(rows === wk.length && wk.every(g => g.result), `all ${wk.length} games that week have results`);
    if (played) ok(wk.some(g => g.result.played && (g.home === 'SSK' || g.away === 'SSK')), 'your game is recorded as played');
    await page.click('#btn-week-go');
  }
  sv = await season(page);
  ok(sv.week >= 2, 'season advanced to week ' + sv.week);

  // Start a game and leave mid-way: it should resume from the hub, even after reload.
  while (!(await page.isVisible('#btn-play'))) { await page.click('#btn-sim-week'); await page.click('#btn-week-go'); }
  await page.click('#btn-play');
  await page.click('#coin-actions [data-call=H]');
  await page.click('#btn-coin-go');
  for (let i = 0; i < 8; i++) { const b = await page.$$('#buttons-pane .pbtn:not([disabled])'); if (b.length) await b[0].click(); await page.waitForTimeout(5); }
  await page.click('#btn-menu'); await page.click('#btn-quit');
  ok(await page.isVisible('#screen-season') && (await page.textContent('#btn-play')) === 'Resume Game', 'Save & Exit returns to the hub with Resume Game');
  await page.reload();
  ok((await page.textContent('#btn-season')).startsWith('Continue Season'), 'start screen offers Continue Season after reload');
  await page.click('#btn-season');
  const before = (await season(page)).live;
  await page.click('#btn-play');
  const resumed = await page.evaluate(() => JSON.parse(JSON.stringify(CFL.ui.state())));
  // The computer may already have taken its next turn, so compare the saved play log as a prefix.
  ok(resumed.id === before.id && resumed.seq >= before.seq &&
    JSON.stringify(resumed.log.slice(0, before.log.length)) === JSON.stringify(before.log), 'season game resumes at the same play');
  await page.click('#btn-menu'); await page.click('#btn-quit');

  // Tabs render
  for (const t of ['standings', 'schedule', 'results', 'playoffs', 'stats']) {
    await page.click(`[data-htab=${t}]`);
    const html = await page.innerHTML('#hub-body');
    ok(html.length > 200, `${t} tab renders`);
    await shot(page, 'tab-' + t);
    ok(await noOverflow(page), `${t} tab fits a phone screen`);
  }
  await page.click('[data-htab=results]');
  await page.click('#hub-body .gline');
  ok(await page.isVisible('#hub-body .gdetail'), 'tapping a score shows team stats');

  // Finish the live game by simming it, then sim to the end of the regular season.
  await page.click('#btn-play');
  await page.click('#btn-menu'); await page.click('#btn-quit');
  // Discarding a live game isn't offered; play it out quickly instead.
  await page.click('#btn-play');
  let n = 0;
  while (!(await page.isVisible('#ov-box')) && n++ < 4000) { const b = await page.$$('#buttons-pane .pbtn:not([disabled])'); if (b.length) await b[0].click(); await page.waitForTimeout(3); }
  await page.click('#btn-box-season'); await page.click('#btn-week-go');
  await page.click('#btn-sim-end');
  ok(await page.isVisible('#screen-season') && (await season(page)).phase === 'regular', 'sim-to-end asks for a second tap');
  await page.click('#btn-sim-end');
  sv = await season(page);
  ok(sv.phase === 'playoffs' && sv.weeks.every(w => w.every(g => g.result)), 'regular season complete, playoffs started');
  await shot(page, 'playoffs-start');

  // Playoffs: play our games if we're in, otherwise sim, until the Grey Cup is decided.
  guard = 0;
  while ((await season(page)).phase !== 'done' && guard++ < 6) {
    if (await page.isVisible('#btn-play')) { await page.click('#btn-sim-mine'); }
    else await page.click('#btn-sim-week');
    await page.click('#btn-week-go');
  }
  sv = await season(page);
  ok(sv.phase === 'done' && !!sv.champion, 'Grey Cup played, champion: ' + sv.champion);
  ok(await page.isVisible('#ov-celebrate') && (await page.textContent('#cel-team')).includes(require('../js/teams.js').byId[sv.champion].name), 'simulated Grey Cup shows the champion celebration');
  await page.click('#btn-cel-go');
  ok(!(await page.isVisible('#ov-celebrate')), 'celebration closes');
  ok(await page.isVisible('#btn-next-season'), 'champion card offers next season');
  await shot(page, 'champion');
  await page.click('#btn-next-season');
  sv = await season(page);
  ok(sv.year === 2 && sv.team === 'SSK' && sv.phase === 'regular', 'season 2 starts with the same team');

  // Play the Grey Cup by hand: banner in the game, celebration at the end.
  await page.evaluate(() => {
    const S = CFL.Season, sv = S.newSeason({ team: 'BC', seed: 321 });
    while (!(sv.phase === 'playoffs' && sv.playoffs.rounds.length === 3)) { S.simCurrent(sv); S.advance(sv); }
    sv.team = sv.playoffs.rounds[2].games[0].home;
    localStorage.setItem('cflArmchair.season', JSON.stringify(sv));
  });
  await page.reload();
  await page.click('#btn-season');
  ok((await page.textContent('#hub-next')).includes('Grey Cup'), 'hub shows the Grey Cup matchup');
  await page.click('#btn-play');
  ok(await page.isVisible('#game-banner') && /Grey Cup/.test(await page.textContent('#game-banner')), 'Grey Cup banner shows in the game');
  ok((await page.innerHTML('#field')).includes('GREY CUP'), 'GREY CUP is painted at midfield');
  await page.click('#coin-actions [data-call=H]'); await page.click('#btn-coin-go');
  await shot(page, 'greycup-game');
  n = 0;
  while (!(await page.isVisible('#ov-celebrate')) && !(await page.isVisible('#ov-box')) && n++ < 4000) { const b = await page.$$('#buttons-pane .pbtn:not([disabled])'); if (b.length) await b[Math.floor(Math.random() * Math.min(b.length, 6))].click(); await page.waitForTimeout(3); }
  ok(await page.isVisible('#ov-celebrate'), 'played Grey Cup ends with the celebration');
  await shot(page, 'celebration');
  await page.click('#btn-cel-go');
  ok(await page.isVisible('#ov-box') && (await page.textContent('#box-title')).startsWith('Season'), 'then the box score, titled as the Grey Cup');
  await page.click('#btn-box-season'); await page.click('#btn-week-go');
  ok(!(await page.isVisible('#ov-celebrate')) && (await season(page)).phase === 'done', 'no second celebration; season complete');
  // A regular single game has no banner.
  await page.click('#btn-hub-back'); await page.click('#btn-newgame');
  await page.click('#grid-team1 [data-team=BC]'); await page.click('#grid-team2 [data-team=CGY]'); await page.click('#btn-start');
  ok(!(await page.isVisible('#game-banner')), 'exhibition games have no banner');
  await page.click('#coin-actions [data-call=H]'); await page.click('#btn-coin-go');
  await page.click('#btn-menu'); await page.click('#btn-quit');

  // Semi-final banner
  await page.evaluate(() => {
    const S = CFL.Season, sv = S.newSeason({ team: 'BC', seed: 99 });
    while (sv.phase === 'regular') { S.simCurrent(sv); S.advance(sv); }
    sv.team = sv.playoffs.rounds[0].games[0].home;
    localStorage.setItem('cflArmchair.season', JSON.stringify(sv));
  });
  await page.reload(); await page.click('#btn-season'); await page.click('#btn-play');
  ok(/Semi-Final/i.test(await page.textContent('#game-banner')), 'semi-final banner shows');
  await shot(page, 'semi-game');
  await page.click('#coin-actions [data-call=H]'); await page.click('#btn-coin-go');
  await page.click('#btn-menu'); await page.click('#btn-quit');

  // Desktop layout
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.click('[data-htab=standings]');
  await shot(page, 'desktop-hub');
  ok(await noOverflow(page), 'hub fits a desktop screen');
  await page.setViewportSize({ width: 360, height: 740 });
  await page.click('[data-htab=playoffs]');
  ok(await noOverflow(page), 'playoffs tab fits a 360 px phone');

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
