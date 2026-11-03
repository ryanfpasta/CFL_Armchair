/* Season mode logic tests. Run: node tests/season.test.js */
const S = require('../js/season.js');
let pass = 0, fail = 0;
function ok(c, n) { if (c) { pass++; console.log('ok  ', n); } else { fail++; console.log('FAIL', n); } }

// 1. Schedules: many seeds, every rule checked.
{
  let bad = [], backToBack = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const w = S.makeSchedule(S.seeded(seed));
    const games = {}, home = {}, pairs = {};
    if (w.length !== 21) bad.push(seed + ': weeks ' + w.length);
    w.forEach((wk, i) => {
      const seen = {};
      if (wk.length < 3 || wk.length > 4) bad.push(seed + ': week size ' + wk.length);
      wk.forEach(g => {
        if (seen[g.home] || seen[g.away]) bad.push(seed + ': double-booked week ' + (i + 1));
        seen[g.home] = seen[g.away] = true;
        games[g.home] = (games[g.home] || 0) + 1; games[g.away] = (games[g.away] || 0) + 1;
        home[g.home] = (home[g.home] || 0) + 1;
        const k = [g.home, g.away].sort().join('-');
        if (pairs[k] !== undefined && pairs[k] === i - 1) backToBack++;
        pairs[k] = i;
      });
    });
    S.allTeams().forEach(t => {
      if (games[t] !== 18) bad.push(seed + ': ' + t + ' plays ' + games[t]);
      if (home[t] !== 9) bad.push(seed + ': ' + t + ' home ' + home[t]);
    });
  }
  ok(bad.length === 0, '200 schedules: 21 weeks, 18 games per team, 9 home / 9 away, nobody double-booked' + (bad.length ? ' ' + bad.slice(0, 3) : ''));
  ok(backToBack === 0, 'no team meets the same opponent in back-to-back weeks (' + backToBack + ')');
  const a = JSON.stringify(S.makeSchedule(S.seeded(42))), b = JSON.stringify(S.makeSchedule(S.seeded(42)));
  ok(a === b, 'same seed gives the same schedule');
  const t0 = Date.now(); S.newSeason({ team: 'SSK' }); ok(Date.now() - t0 < 1500, 'schedule builds quickly (' + (Date.now() - t0) + ' ms)');
}

// 2. Standings and tiebreakers, using hand-entered results.
function blank(seed) { const s = S.newSeason({ team: 'BC', seed }); return s; }
function fake(score) { return { score, ot: false, stats: null }; }
{
  const s = blank(7);
  // Give every regular-season game to the home team, then check totals.
  s.weeks.forEach(wk => wk.forEach(g => { g.result = fake([20, 10]); }));
  const st = S.standings(s);
  const all = st.West.concat(st.East);
  ok(all.every(r => r.gp === 18 && r.w === 9 && r.l === 9 && r.pts === 18 && r.pf === 270 && r.pa === 270), 'home-team-wins season: everyone 9-9, 18 pts, PF/PA add up');
  ok(st.West.length === 5 && st.East.length === 4 && st.West.every((r, i) => r.place === i + 1), 'divisions are 5 West, 4 East, ranked 1..n');
}
{
  // Alphabetically earlier team always wins: BC > CGY > EDM > SSK > WPG in the West.
  const s = blank(9);
  s.weeks.forEach(wk => wk.forEach(g => { g.result = fake([g.home < g.away ? 21 : 7, g.home < g.away ? 7 : 21]); }));
  const st = S.standings(s);
  ok(st.West.map(r => r.id).join() === 'BC,CGY,EDM,SSK,WPG' && st.East.map(r => r.id).join() === 'HAM,MTL,OTT,TOR', 'standings order follows results');
}
{
  // Head-to-head decides a two-way tie: CGY beats BC every time, then drops games to WPG until level.
  let found = false, right = true;
  for (let seed = 1; seed <= 40; seed++) {
    const s = blank(seed);
    s.weeks.forEach(wk => wk.forEach(g => {
      const k = [g.home, g.away].sort().join();
      const homeWins = k === 'BC,CGY' ? g.home === 'CGY' : g.home < g.away;
      g.result = fake(homeWins ? [21, 7] : [7, 21]);
    }));
    const row = id => S.standings(s).West.find(r => r.id === id);
    for (const g of s.weeks.flat()) {
      if (row('CGY').pts <= row('BC').pts) break;
      if ([g.home, g.away].sort().join() === 'CGY,WPG') g.result = fake(g.home === 'WPG' ? [28, 1] : [1, 28]);
    }
    const st = S.standings(s).West;
    if (row('CGY').pts === row('BC').pts && row('EDM').pts < row('BC').pts) { found = true; if (st[0].id !== 'CGY') right = false; }
  }
  ok(found && right, 'tie on points broken by head-to-head (CGY over BC)');
}

// 3. Crossover rule.
{
  const s = blank(11);
  // West teams beat East teams always; within divisions, alphabetical wins.
  s.weeks.forEach(wk => wk.forEach(g => {
    const dh = S.divisionOf(g.home), da = S.divisionOf(g.away);
    let homeWins = dh !== da ? dh === 'West' : g.home < g.away;
    g.result = fake(homeWins ? [24, 10] : [10, 24]);
  }));
  const f = S.playoffField(s);
  ok(f.crossover && f.crossover.team === 'SSK' && f.crossover.to === 'East' && f.bracket.East[2] === 'SSK', 'West 4th with more points than East 3rd crosses over (' + JSON.stringify(f.crossover) + ')');
  ok(f.bracket.West.join() === 'BC,CGY,EDM', 'West bracket is the top three');
}
{
  const s = blank(12);
  s.weeks.forEach(wk => wk.forEach(g => { g.result = fake([20, 10]); }));
  const f = S.playoffField(s);
  ok(f.crossover === null, 'no crossover when 4th place is level on points with the other 3rd');
}

// 4. Full simulated seasons through the Grey Cup.
{
  let problems = [], crossovers = 0, champs = {};
  const t0 = Date.now();
  for (let n = 0; n < 40; n++) {
    const rng = S.seeded(1000 + n);
    const s = S.newSeason({ team: 'WPG', seed: 500 + n });
    let guard = 0;
    while (s.phase !== 'done') {
      S.simCurrent(s, rng);
      if (!S.advance(s)) problems.push('stuck');
      if (++guard > 40) { problems.push('loop'); break; }
    }
    const st = S.standings(s), all = st.West.concat(st.East);
    if (!all.every(r => r.gp === 18)) problems.push('gp');
    if (all.reduce((a, r) => a + r.w, 0) !== 81 || all.reduce((a, r) => a + r.l, 0) !== 81) problems.push('w/l');
    if (s.playoffs.rounds.length !== 3) problems.push('rounds');
    const gc = s.playoffs.rounds[2].games[0];
    if (S.divisionOf(gc.home) === S.divisionOf(gc.away) && !s.playoffs.crossover) problems.push('grey cup same division');
    if (s.playoffs.rounds.some(r => r.games.some(g => g.result.score[0] === g.result.score[1]))) problems.push('playoff tie');
    // The first-place team gets a bye and hosts the final.
    ['West', 'East'].forEach(d => {
      const fin = s.playoffs.rounds[1].games.find(g => g.div === d);
      if (fin.home !== s.playoffs.bracket[d][0]) problems.push('final host');
      if (s.playoffs.rounds[0].games.some(g => g.home === fin.home || g.away === fin.home)) problems.push('no bye');
    });
    if (s.champion !== S.winnerOf(gc)) problems.push('champion');
    if (S.teamStatus(s, s.champion) !== 'champion') problems.push('status');
    if (s.playoffs.crossover) crossovers++;
    champs[s.champion] = (champs[s.champion] || 0) + 1;
    const ts = S.teamStats(s);
    if (!ts.every(r => r.gp === 18 && r.yds === r.pass + r.rush)) problems.push('team stats');
  }
  ok(problems.length === 0, '40 full seasons simulated to a Grey Cup champion with no problems (' + (Date.now() - t0) + ' ms)' + (problems.length ? ' ' + problems.slice(0, 5) : ''));
  console.log('     crossovers in 40 seasons:', crossovers, ' champions:', JSON.stringify(champs));
}

// 5. A human team's game is held back, then recorded.
{
  const s = S.newSeason({ team: 'TOR', seed: 77 });
  const rng = S.seeded(5);
  let week = 0, held = 0;
  while (s.phase === 'regular') {
    const mine = S.teamGame(s, 'TOR');
    S.simCurrent(s, rng, 'TOR');
    if (mine) {
      if (mine.result) held = -999;
      held++;
      S.record(s, mine.id, { score: [1, 0], ot: false, stats: null, played: true });
    }
    S.advance(s); week++;
  }
  const tor = S.standings(s).East.find(r => r.id === 'TOR');
  ok(held === 18 && week === 21, 'human team\'s 18 games are left for the player each week');
  ok(tor.gp === 18, 'recorded human results count in the standings');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
