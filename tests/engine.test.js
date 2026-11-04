/* Acceptance tests for the rules engine and computer opponent. Run: node tests/engine.test.js */
const E = require('../js/engine.js'), AI = require('../js/ai.js');
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) pass++; else { fail++; console.log('FAIL:', name); } }
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
/* rng that produces exact dice: dice(3,4,6,6) gives rolls [3,4],[6,6] */
function dice(...v) { let i = 0; return () => { if (i >= v.length) throw new Error('ran out of scripted dice'); return (v[i++] - 0.5) / 6; }; }
function sumDice(n) { return n <= 7 ? [1, n - 1] : [6, n - 6]; }
function roll(...sums) { return dice(...sums.flatMap(sumDice)); }
function game(over) {
  const s = E.newGame({ home: 'BC', away: 'CGY', ctrl: ['human', 'human'], mode: 'pnp' });
  E.coinToss(s, null, 0);
  Object.assign(s, { phase: 'play', poss: 0, ballOn: 30, down: 1, ltg: 40, clock: 600 }, over || {});
  return s;
}
function section(n) { console.log('— ' + n); }

section('3-down logic');
{ const s = game();
  E.act(s, 'SR', roll(4)); eq([s.down, s.ballOn, s.poss], [2, 30, 0], 'no gain -> 2nd down');
  E.act(s, 'SR', roll(5)); eq([s.down, s.ballOn, E.toGo(s)], [3, 32, 8], 'gain 2 -> 3rd & 8');
  E.act(s, 'SR', roll(7)); eq([s.poss, s.ballOn, s.down, s.ltg], [1, 74, 1, 84], 'short on 3rd -> other team at the spot (own 36 = 110-74... from their side)');
  ok(/turnover on downs/.test(s.log[s.log.length - 1].text), 'log says turnover on downs');
  const s2 = game(); E.act(s2, 'SP', roll(4)); E.act(s2, 'SP', roll(4)); E.act(s2, 'SP', roll(4));
  eq([s2.poss, s2.ballOn, s2.down], [1, 80, 1], 'three incompletions -> other team at the original spot');
}

section('First-down reset and 1st-and-goal');
{ const s = game(); E.act(s, 'SP', roll(10)); eq([s.down, s.ballOn, s.ltg], [1, 40, 50], 'gain 10 -> 1st & 10 new line');
  const s2 = game({ ballOn: 98, ltg: 102, down: 2 }); E.act(s2, 'SR', roll(9)); eq([s2.down, s2.ballOn, s2.ltg, E.downDistance(s2)], [1, 103, 110, '1st & Goal'], 'first down inside the 10 -> 1st & Goal');
  const s3 = game({ ballOn: 85, ltg: 95 }); E.act(s3, 'SR', roll(12)); eq([s3.ballOn, s3.ltg, E.downDistance(s3)], [100, 110, '1st & Goal'], 'line to gain capped at goal line');
}

section('Touchdown and converts');
{ const s = game({ ballOn: 60, ltg: 70 }); const r = E.act(s, 'LP', roll(12));
  eq([s.score[0], s.phase, r.yards], [6, 'convert', 50], 'Long Pass 55 from the CGY 50 -> TD credited 50 yds');
  E.act(s, 'CONV1', roll(3)); eq([s.score[0], s.phase, s.kicker], [7, 'kickoff', 0], '1-pt kick good on 3, scoring team kicks off');
  const s2 = game({ phase: 'convert' }); E.act(s2, 'CONV1', roll(2)); eq(s2.score[0], 0, '1-pt kick misses on 2');
  const s3 = game({ phase: 'convert' }); E.act(s3, 'CONV2', roll(8)); eq(s3.score[0], 2, '2-pt good on 8');
  const s4 = game({ phase: 'convert' }); E.act(s4, 'CONV2', roll(7)); eq(s4.score[0], 0, '2-pt fails on 7');
  ok(s4.clock === 600, 'convert burns no time');
}

section('Field goal');
{ const s = game({ ballOn: 80, ltg: 90, down: 3 }); eq([E.fgDistance(s), E.fgNeed(37)], [37, 5], 'distance = to goal + 7');
  E.act(s, 'FG', roll(5)); eq([s.score[0], s.phase, s.kicker, s.stats[0].fg], [3, 'kickoff', 0, [1, 1]], 'FG good, kicker kicks off');
  const far = game({ ballOn: 56 }); const a = E.availableActions(far).find(x => x.id === 'FG'); eq([E.fgDistance(far), a.enabled], [61, false], 'FG hidden beyond 60 yds');
  const s60 = game({ ballOn: 57 }); ok(E.availableActions(s60).find(x => x.id === 'FG').enabled, 'FG available at 60 yds');
  const thr = [[19, 3], [20, 4], [29, 4], [30, 5], [39, 5], [40, 6], [49, 6], [50, 8], [59, 8], [60, 10]];
  thr.forEach(([d, n]) => eq(E.fgNeed(d), n, 'FG threshold at ' + d));
}

section('Safety');
{ const s = game({ ballOn: 3, ltg: 13 }); const r = E.act(s, 'SP', roll(3));
  eq([s.score, s.phase, s.kicker, r.yards], [[0, 2], 'kickoff', 0, -3], 'sack in own end zone -> 2 pts defence, conceding team kicks off');
  E.act(s, 'KICKOFF', roll(7)); eq([s.poss, s.ballOn], [1, 35], 'safety kickoff uses kickoff table');
  const k = game({ ballOn: 1, ltg: 11 }); E.act(k, 'KNEEL'); eq(k.score[1], 2, 'kneel on own 1 is a safety');
}

section('Punts and rouge');
{ const s = game({ ballOn: 80, ltg: 90, down: 3 }); E.act(s, 'PUNT', roll(7, 3));
  eq([s.score[0], s.poss, s.ballOn, s.phase], [1, 1, 35, 'play'], 'punt into end zone, no return -> rouge, receiver at own 35');
  const s2 = game({ ballOn: 80 }); E.act(s2, 'PUNT', roll(7, 4)); eq([s2.score[0], s2.poss, s2.ballOn], [0, 1, 2], 'punt into end zone returned 2 -> no rouge, ball at goal line + 2');
  const s3 = game({ ballOn: 30 }); E.act(s3, 'PUNT', roll(7, 7)); eq([s3.poss, s3.ballOn], [1, 50], 'punt 40 from own 30, 10-yd return -> receiver at own 50');
  const s4 = game({ ballOn: 30 }); E.act(s4, 'PUNT', roll(7, 2)); eq([s4.poss, s4.ballOn, s4.stats[1].fumbles], [0, 70, 1], 'muffed punt -> kicking team at the catch spot');
  const s5 = game({ ballOn: 30 }); E.act(s5, 'PUNT', roll(7, 12)); eq([s5.score[1], s5.phase, s5.poss], [6, 'convert', 1], 'punt return TD');
  eq(s5.clock, 590, 'punt burns 10 s');
}

section('Missed field goal and rouge');
{ const s = game({ ballOn: 60 }); E.act(s, 'FG', roll(7, 3)); eq([s.score[0], s.poss, s.ballOn, s.stats[0].fg], [1, 1, 35, [0, 1]], 'missed FG, no return -> rouge, defence at own 35');
  const s2 = game({ ballOn: 60 }); E.act(s2, 'FG', roll(7, 5)); eq([s2.score[0], s2.poss, s2.ballOn], [0, 1, 5], 'missed FG returned 5 -> no rouge, defence at own 5');
}

section('Kickoffs');
{ const want = { 3: 25, 4: 30, 5: 35, 6: 35, 7: 35, 8: 40, 9: 45, 10: 50, 11: 55 };
  for (const k in want) { const s = game({ phase: 'kickoff', kicker: 1 }); E.act(s, 'KICKOFF', roll(+k)); eq([s.poss, s.ballOn, s.down, s.ltg], [0, want[k], 1, want[k] + 10], 'kickoff roll ' + k); }
  const f = game({ phase: 'kickoff', kicker: 1 }); E.act(f, 'KICKOFF', roll(2)); eq([f.poss, f.ballOn], [1, 75], 'kickoff fumble -> kicking team at receiver 35');
  const t = game({ phase: 'kickoff', kicker: 1 }); E.act(t, 'KICKOFF', roll(12)); eq([t.score[0], t.phase], [6, 'convert'], 'kickoff return TD');
}

section('Onside kick');
{ const early = game({ phase: 'kickoff', kicker: 0, quarter: 2, clock: 400 });
  ok(!E.availableActions(early).find(x => x.id === 'ONSIDE').enabled, 'onside not available before the last 3 minutes');
  ok(!E.availableActions(game({ phase: 'kickoff', kicker: 0, quarter: 3, clock: 100 })).find(x => x.id === 'ONSIDE').enabled, 'onside not available in Q3');
  const w = game({ phase: 'kickoff', kicker: 0, quarter: 4, clock: 150 }); E.act(w, 'ONSIDE', roll(11));
  eq([w.poss, w.ballOn, w.down, w.clock], [0, 45, 1, 140], 'onside recovered on 11: kicking team at own 45');
  const l = game({ phase: 'kickoff', kicker: 0, quarter: 2, clock: 180 }); E.act(l, 'ONSIDE', roll(10));
  eq([l.poss, l.ballOn], [1, 65], 'onside fails on 10: receiver at the kicking team 45');
  const ai = game({ phase: 'kickoff', kicker: 1, quarter: 4, clock: 100 }); ai.score = [17, 10];
  eq(AI.decide(ai).id, 'ONSIDE', 'computer trailing late -> onside');
  const ai2 = game({ phase: 'kickoff', kicker: 1, quarter: 4, clock: 100 }); ai2.score = [10, 17];
  eq(AI.decide(ai2).id, 'KICKOFF', 'computer leading -> normal kickoff');
}

section('Turnovers');
{ const s = game({ ballOn: 50 }); E.act(s, 'LP', roll(3)); eq([s.poss, s.ballOn, s.down, s.stats[0].ints, s.clock], [1, 60, 1, 1, 585], 'interception at LOS, no return, 15 s');
  const f = game({ ballOn: 50 }); E.act(f, 'LR', roll(2)); eq([f.poss, f.ballOn, f.stats[0].fumbles], [1, 60, 1], 'fumble lost at LOS');
}

section('Clock');
{ const s = game({ clock: 20, quarter: 1 }); E.act(s, 'SR', roll(7)); eq([s.quarter, s.clock, s.poss, s.ballOn], [2, 900, 0, 34], 'Q1 ends, possession carries into Q2');
  const w = game({ quarter: 2, clock: 200 }); const r = E.act(w, 'SR', roll(7)); eq([w.clock, r.events[0] && r.events[0].type], [180, 'warning'], '3-minute warning fires at 3:00');
  E.act(w, 'SR', roll(7)); eq(w.clock, 170, 'last 3 minutes: clock stops after every play (run burns 10 s)');
  E.act(w, 'KNEEL'); eq(w.clock, 130, 'kneel burns 40 s');
  const h = game({ quarter: 2, clock: 5 }); E.act(h, 'SR', roll(7)); eq([h.quarter, h.clock, h.phase, h.kicker], [3, 900, 'kickoff', 0], 'halftime: opening receiver (BC) kicks off the 2nd half');
  E.act(h, 'KICKOFF', roll(7)); eq(h.poss, 1, 'CGY receives 2nd-half kickoff');
  const g = game({ quarter: 4, clock: 10 }); g.score = [10, 3]; E.act(g, 'SR', roll(7)); eq([g.phase, g.winner, g.clock], ['final', 0, 0], 'game ends at 0:00 in Q4');
  const td = game({ quarter: 4, clock: 10, ballOn: 107, ltg: 110 }); td.score = [3, 7]; E.act(td, 'SR', roll(8));
  eq(td.phase, 'convert', 'last-play TD still gets its convert'); E.act(td, 'CONV1', roll(6)); eq([td.phase, td.score], ['final', [10, 7]], 'game ends after the convert');
  const t = game({ quarter: 1, clock: 600 }); E.act(t, 'TIMEOUT'); eq([t.timeouts[0], t.clock], [1, 600], 'timeout burns no time');
  ok(!E.availableActions(t).find(x => x.id === 'TIMEOUT').enabled, 'no timeout while clock stopped');
  E.act(t, 'SR', roll(7)); eq(t.clock, 590, 'after a timeout the next run burns 10 s');
  E.act(t, 'SR', roll(7)); eq(t.clock, 555, 'clock running again: 35 s');
  const i = game(); E.act(i, 'SP', roll(4)); eq(i.clock, 592, 'incomplete 8 s');
  const k = game(); E.act(k, 'SP', roll(3)); eq(k.clock, 570, 'sack 30 s');
  const q4 = game({ quarter: 4, clock: 10 }); q4.score = [7, 7]; E.act(q4, 'SR', roll(7)); eq([q4.quarter, q4.phase, q4.poss, q4.ballOn], [5, 'play', 1, 75], 'tie at 0:00 -> OT, first team at opponent 35');
}

section('Overtime shootout');
{ const s = game({ quarter: 4, clock: 5 }); s.score = [7, 7]; s.openingReceiver = 0; E.act(s, 'SR', roll(7));
  ok(s.ot && s.ot.round === 1, 'OT started');
  const first = s.poss;
  ok(!E.availableActions(s).find(x => x.id === 'PUNT').enabled, 'no punts in OT');
  E.act(s, 'FG', roll(12)); eq([s.score[first], s.poss, s.ballOn], [10, 1 - first, 75], 'OT FG ends possession, other team starts at opp 35');
  E.act(s, 'FG', roll(12)); eq([s.ot.round, s.poss, s.phase], [2, first, 'play'], 'still tied -> round 2');
  E.act(s, 'LP', roll(12)); E.act(s, 'CONV1', roll(6)); eq(s.poss, 1 - first, 'TD+convert ends possession');
  E.act(s, 'SP', roll(2)); eq([s.phase, s.winner, s.score[first] - s.score[1 - first]], ['final', first, 7], 'interception ends possession; leader wins');
  eq(s.stats[first].pts[4], 10, 'OT points recorded in OT column');
}

section('Stats (random full games)');
{ let bad = 0, games = 500;
  for (let n = 0; n < games; n++) {
    const s = E.newGame({ home: 'WPG', away: 'SSK', ctrl: ['cpu', 'cpu'] }); E.coinToss(s);
    let thirdAtt = [0, 0], thirdMade = [0, 0], sacks = [0, 0], ints = [0, 0];
    while (s.phase !== 'final') {
      const pre = { down: s.down, poss: s.poss, phase: s.phase };
      const id = AI.decide(s).id; const r = E.act(s, id);
      if (pre.phase === 'play' && pre.down === 3 && ['SR', 'LR', 'SP', 'LP', 'KNEEL', 'FAKE_PUNT', 'FAKE_FG'].includes(id)) {
        thirdAtt[pre.poss]++; if (/1st down|TOUCHDOWN/.test(r.logText) && !/fumble|intercept/i.test(r.logText)) thirdMade[pre.poss]++;
      }
      if (/^Sacked/.test(r.logText)) sacks[pre.poss]++;
      if (/intercepted/.test(r.logText)) ints[pre.poss]++;
    }
    for (const t of [0, 1]) {
      const st = s.stats[t];
      if (s.playYards[t].reduce((a, b) => a + b, 0) !== st.yards) bad++;
      const logYds = s.log.filter(e => e.team === t && typeof e.yards === 'number').reduce((a, e) => a + e.yards, 0);
      if (logYds !== st.yards) bad++;
      if (st.passYds + st.rushYds !== st.yards) bad++;
      if (st.third[0] !== thirdMade[t] || st.third[1] !== thirdAtt[t]) bad++;
      if (st.sacks !== sacks[t] || st.ints !== ints[t]) bad++;
      if (st.pts.reduce((a, b) => a + b, 0) !== s.score[t]) bad++;
    }
  }
  eq(bad, 0, games + ' games: total yards = sum of play yards; 3rd downs, sacks, INTs, points by quarter all reconcile');
}

section('Fake punt and fake field goal');
{ const has = (st, id) => E.availableActions(st).find(x => x.id === id).enabled;
  ok(!has(game({ down: 2 }), 'FAKE_PUNT') && !has(game({ down: 2, ballOn: 80, ltg: 90 }), 'FAKE_FG'), 'fakes are 3rd down only');
  ok(has(game({ down: 3 }), 'FAKE_PUNT'), 'fake punt on 3rd down');
  ok(!has(game({ down: 3, ballOn: 30 }), 'FAKE_FG') && has(game({ down: 3, ballOn: 60, ltg: 65 }), 'FAKE_FG'), 'fake FG only in field-goal range');
  let s = game({ down: 3, ballOn: 30, ltg: 38 }); E.act(s, 'FAKE_PUNT', roll(9));
  eq([s.poss, s.ballOn, s.down], [0, 45, 1], 'fake punt on 9: +15, first down');
  ok(/FAKE!/.test(s.last.headline), 'headline calls the fake: ' + s.last.headline);
  s = game({ down: 3, ballOn: 30, ltg: 38 }); E.act(s, 'FAKE_PUNT', roll(5));
  eq([s.poss, s.ballOn, s.down], [1, 80, 1], 'fake punt stuffed on 5: no gain, turnover on downs at the spot');
  s = game({ down: 3, ballOn: 30, ltg: 38 }); E.act(s, 'FAKE_PUNT', roll(12));
  eq([s.score[0], s.phase], [6, 'convert'], 'fake punt on 12: punter goes all the way');
  s = game({ down: 3, ballOn: 30, ltg: 38 }); E.act(s, 'FAKE_PUNT', roll(2));
  eq([s.poss, s.ballOn, s.stats[0].fumbles], [1, 80, 1], 'fake punt on 2: fumble lost at the line');
  s = game({ down: 3, ballOn: 80, ltg: 86 }); E.act(s, 'FAKE_FG', roll(10));
  eq([s.poss, s.ballOn, s.down, s.ltg], [0, 98, 1, 108], 'fake FG on 10: +18, first down');
  s = game({ down: 3, ballOn: 80, ltg: 86 }); E.act(s, 'FAKE_FG', roll(6));
  eq([s.poss, s.ballOn, s.score[0]], [1, 30, 0], 'fake FG incomplete on 6: turnover on downs, no points');
  s = game({ down: 3, ballOn: 80, ltg: 86 }); E.act(s, 'FAKE_FG', roll(12));
  eq(s.score[0], 6, 'fake FG on 12: touchdown');
  const ai = game({ down: 3, ballOn: 40, ltg: 47, quarter: 4, clock: 120 }); ai.score = [3, 20];
  eq(AI.decide(ai, Math.random).id, 'FAKE_PUNT', 'computer down two scores late on 3rd & 7 -> fake punt');
  let fakes = 0; for (let n = 0; n < 4000; n++) if (AI.decide(game({ down: 3, ballOn: 55, ltg: 58 }), Math.random).id === 'FAKE_PUNT') fakes++;
  ok(fakes > 100 && fakes < 400, 'computer occasionally fakes on 3rd & 3 at midfield (' + fakes + '/4000)');
}

section('Computer opponent');
{ const R = Math.random;
  const at = (o, sc) => { const s = game(o); if (sc) s.score = sc; return s; };
  eq(AI.decide(at({ down: 3, ballOn: 20, ltg: 29 }), R).id, 'PUNT', '3rd & 9 own 20 -> punt');
  eq(AI.decide(at({ down: 3, ballOn: 80, ltg: 85 }), R).id, 'FG', '3rd & 5 at opp 30 -> FG');
  eq(AI.decide(at({ down: 3, ballOn: 40, ltg: 41 }), R).id, 'SR', '3rd & 1 anywhere -> Short Run');
  ok(AI.decide(at({ down: 3, ballOn: 40, ltg: 45, quarter: 4, clock: 120 }, [3, 7]), R).id !== 'PUNT', 'trailing by 4, Q4 2:00, 3rd & 5 own 40 -> goes for it');
  ok(!['PUNT', 'FG'].includes(AI.decide(at({ down: 3, ballOn: 80, ltg: 85, quarter: 4, clock: 120 }, [3, 10]), R).id), 'trailing by 7 late at opp 30 -> goes for it, no FG');
  eq(AI.decide(at({ down: 3, ballOn: 80, ltg: 85, quarter: 4, clock: 120 }, [7, 9]), R).id, 'FG', 'trailing by 2 late in range -> FG');
  eq(AI.decide(at({ down: 1, ballOn: 50, ltg: 60, quarter: 4, clock: 50 }, [14, 10]), R).id, 'KNEEL', 'leading in last minute -> kneel');
  ok(AI.decide(at({ down: 1, ballOn: 50, ltg: 60, quarter: 4, clock: 50 }, [10, 14]), R).id !== 'KNEEL', 'trailing in last minute -> no kneel');
  let lpOwn = 0, lpRed = 0, mix = {};
  for (let n = 0; n < 4000; n++) {
    if (AI.decide(at({ ballOn: 5, ltg: 15 }), R).id === 'LP') lpOwn++;
    if (AI.decide(at({ ballOn: 95, ltg: 105 }), R).id === 'LP') lpRed++;
    const id = AI.decide(at({ ballOn: 40, ltg: 50 }), R).id; mix[id] = (mix[id] || 0) + 1;
  }
  eq([lpOwn, lpRed], [0, 0], 'no Long Pass inside own 10 or opponent 20');
  ok(Math.abs(mix.SR / 4000 - .30) < .04 && Math.abs(mix.LP / 4000 - .25) < .04 && Math.abs(mix.LR / 4000 - .15) < .04, '1st-down mix ~30/15/30/25: ' + JSON.stringify(mix));
  const c = at({ phase: 'convert', quarter: 4, clock: 120 }, [13, 15]); eq(AI.decide(c, R).id, 'CONV2', 'trailing by 2 after TD late -> go for 2');
  const c2 = at({ phase: 'convert', quarter: 4, clock: 120 }, [16, 15]); eq(AI.decide(c2, R).id, 'CONV1', 'leading -> kick');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
