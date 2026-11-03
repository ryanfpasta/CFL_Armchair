/* CFL Armchair Football — season mode.
   Pure logic: schedule, standings, tiebreakers, crossover playoffs and the Grey Cup. No DOM.
   Works in the browser (window.CFL.Season) and in Node (module.exports). */
(function (root) {
  'use strict';
  var E = root.CFL && root.CFL.Engine, AI = root.CFL && root.CFL.AI;
  if (typeof module !== 'undefined' && module.exports) { E = E || require('./engine.js'); AI = AI || require('./ai.js'); }

  var DIVISIONS = { West: ['BC', 'CGY', 'EDM', 'SSK', 'WPG'], East: ['HAM', 'MTL', 'OTT', 'TOR'] };
  var WEEKS = 21, GAMES = 18;
  var HOSTS = ['Regina', 'Winnipeg', 'Hamilton', 'Vancouver', 'Calgary', 'Montreal', 'Edmonton', 'Ottawa', 'Toronto'];
  var ROUND_NAMES = ['Division Semi-Finals', 'Division Finals', 'Grey Cup'];

  function divisionOf(id) { return DIVISIONS.West.indexOf(id) >= 0 ? 'West' : 'East'; }
  function allTeams() { return DIVISIONS.West.concat(DIVISIONS.East); }

  /* Small seeded RNG so a schedule can be rebuilt and tested. */
  function seeded(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }

  /* 18 games per team over 21 weeks: home and away against every team (16 games),
     plus two more against division rivals (one home, one away). 81 games, so 18 weeks have
     four games (one bye) and three weeks have three games (three byes). */
  function matchups(rng) {
    var T = allTeams(), out = [], i, j;
    for (i = 0; i < T.length; i++) for (j = 0; j < T.length; j++) if (i !== j) out.push({ home: T[i], away: T[j] });
    ['West', 'East'].forEach(function (d) {
      var c = shuffle(DIVISIONS[d].slice(), rng);
      for (var k = 0; k < c.length; k++) out.push({ home: c[k], away: c[(k + 1) % c.length] });
    });
    return out;
  }
  function makeSchedule(rng) {
    rng = rng || Math.random;
    for (var attempt = 0; attempt < 5000; attempt++) {
      var left = matchups(rng), weeks = [], lastMet = {}, ok = true;
      var small = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], rng).slice(0, 3);
      for (var w = 0; w < WEEKS && ok; w++) {
        var target = small.indexOf(w) >= 0 ? 3 : 4, weeksLeft = WEEKS - w, remain = {};
        left.forEach(function (g) { remain[g.home] = (remain[g.home] || 0) + 1; remain[g.away] = (remain[g.away] || 0) + 1; });
        // Teams whose remaining games fill every remaining week must play this week.
        var must = Object.keys(remain).filter(function (t) { return remain[t] >= weeksLeft; });
        var order = left.map(function (g, idx) {
          var key = function (a, b) { return a < b ? a + b : b + a; }(g.home, g.away);
          var recent = lastMet[key] !== undefined && w - lastMet[key] < 3 ? 1 : 0;
          var b2b = lastMet[key] === w - 1;
          return { idx: idx, g: g, b2b: b2b, p: (must.indexOf(g.home) >= 0) + (must.indexOf(g.away) >= 0), r: remain[g.home] + remain[g.away], recent: recent, x: rng() };
        }).sort(function (a, b) { return b.p - a.p || a.recent - b.recent || b.r - a.r || a.x - b.x; });
        var used = {}, pick = [];
        for (var k = 0; k < order.length && pick.length < target; k++) {
          var g = order[k].g;
          if (used[g.home] || used[g.away] || order[k].b2b) continue;
          used[g.home] = used[g.away] = true; pick.push(order[k].idx);
        }
        if (pick.length < target || must.some(function (t) { return !used[t]; })) { ok = false; break; }
        pick.sort(function (a, b) { return b - a; });
        var wk = [];
        pick.forEach(function (idx) {
          var g = left.splice(idx, 1)[0];
          lastMet[g.home < g.away ? g.home + g.away : g.away + g.home] = w;
          wk.push({ home: g.home, away: g.away });
        });
        weeks.push(wk);
      }
      if (ok && left.length === 0) return weeks;
    }
    throw new Error('Could not build a schedule');
  }

  function newSeason(opts) {
    opts = opts || {};
    var seed = opts.seed !== undefined ? opts.seed : Math.floor(Math.random() * 4294967296);
    var year = opts.year || 1;
    var weeks = makeSchedule(seeded(seed)).map(function (wk, w) {
      return wk.map(function (g, i) { return { id: 'w' + (w + 1) + 'g' + (i + 1), week: w + 1, home: g.home, away: g.away, result: null }; });
    });
    return {
      v: 1, kind: 'season', id: 's' + seed.toString(36) + '-' + year,
      seed: seed, year: year, team: opts.team || null, created: new Date().toISOString(),
      weeks: weeks, week: 1, phase: 'regular', playoffs: null, champion: null,
      host: HOSTS[(year - 1 + (seed % HOSTS.length)) % HOSTS.length], live: null
    };
  }

  /* ---------- results ---------- */
  function resultFromGame(s) {
    function st(i) { var x = s.stats[i]; return { yds: x.yards, pass: x.passYds, rush: x.rushYds, fd: x.firstDowns, to: x.ints + x.fumbles, sacks: x.sacks }; }
    return { score: s.score.slice(), ot: !!s.ot, stats: [st(0), st(1)], played: s.ctrl.indexOf('human') >= 0 };
  }
  /* A full computer-vs-computer game with the same dice tables and play calling. */
  function simGame(home, away, rng) {
    var s = E.newGame({ home: home, away: away, ctrl: ['cpu', 'cpu'], mode: 'solo' });
    E.coinToss(s, rng);
    var n = 0;
    while (s.phase !== 'final') { E.act(s, AI.decide(s, rng).id, rng); if (++n > 4000) throw new Error('runaway game'); }
    return resultFromGame(s);
  }
  function allGames(season) {
    var out = [];
    season.weeks.forEach(function (wk) { out = out.concat(wk); });
    if (season.playoffs) season.playoffs.rounds.forEach(function (r) { out = out.concat(r.games); });
    return out;
  }
  function findGame(season, id) { return allGames(season).filter(function (g) { return g.id === id; })[0] || null; }
  function winnerOf(g) { return g.result ? (g.result.score[0] > g.result.score[1] ? g.home : g.away) : null; }
  function loserOf(g) { return g.result ? (g.result.score[0] > g.result.score[1] ? g.away : g.home) : null; }

  /* The games still to play right now: this week's regular-season games, or the current playoff round. */
  function currentGames(season) {
    if (season.phase === 'regular') return season.weeks[season.week - 1];
    if (season.phase === 'playoffs') { var r = season.playoffs.rounds; return r[r.length - 1].games; }
    return [];
  }
  function teamGame(season, team) {
    return currentGames(season).filter(function (g) { return !g.result && (g.home === team || g.away === team); })[0] || null;
  }
  function record(season, id, result) {
    var g = findGame(season, id);
    if (!g) throw new Error('No game ' + id);
    g.result = result;
    return g;
  }
  /* Sim every unplayed game in the current week/round, except the one for `skip` (a team id). */
  function simCurrent(season, rng, skip) {
    var done = [];
    currentGames(season).forEach(function (g) {
      if (g.result || (skip && (g.home === skip || g.away === skip))) return;
      g.result = simGame(g.home, g.away, rng); done.push(g);
    });
    return done;
  }
  function currentDone(season) { return currentGames(season).every(function (g) { return !!g.result; }); }

  /* Move to the next week, the playoffs, the next playoff round, or the end of the season. */
  function advance(season) {
    if (!currentDone(season)) return false;
    if (season.phase === 'regular') {
      if (season.week < WEEKS) season.week++;
      else startPlayoffs(season);
      return true;
    }
    if (season.phase === 'playoffs') {
      var rounds = season.playoffs.rounds, last = rounds[rounds.length - 1];
      if (rounds.length === 1) {
        rounds.push({ name: ROUND_NAMES[1], games: ['West', 'East'].map(function (d) {
          var b = season.playoffs.bracket[d], semi = last.games.filter(function (g) { return g.div === d; })[0];
          return { id: 'p2' + d[0], week: WEEKS + 2, div: d, label: d + ' Final', home: b[0], away: winnerOf(semi), result: null };
        }) });
      } else if (rounds.length === 2) {
        var w = winnerOf(last.games.filter(function (g) { return g.div === 'West'; })[0]);
        var e = winnerOf(last.games.filter(function (g) { return g.div === 'East'; })[0]);
        rounds.push({ name: ROUND_NAMES[2], games: [{ id: 'p3', week: WEEKS + 3, div: null, label: 'Grey Cup at ' + season.host, neutral: true, home: w, away: e, result: null }] });
      } else {
        season.champion = winnerOf(last.games[0]);
        season.phase = 'done';
      }
      return true;
    }
    return false;
  }

  /* ---------- standings ---------- */
  function regularGames(season) {
    var out = [];
    season.weeks.forEach(function (wk) { wk.forEach(function (g) { if (g.result) out.push(g); }); });
    return out;
  }
  function baseRows(season) {
    var rows = {};
    allTeams().forEach(function (t) { rows[t] = { id: t, div: divisionOf(t), gp: 0, w: 0, l: 0, t: 0, pts: 0, pf: 0, pa: 0, streak: '', last: [] }; });
    regularGames(season).sort(function (a, b) { return a.week - b.week; }).forEach(function (g) {
      var s = g.result.score;
      [[g.home, s[0], s[1]], [g.away, s[1], s[0]]].forEach(function (x) {
        var r = rows[x[0]];
        r.gp++; r.pf += x[1]; r.pa += x[2];
        if (x[1] > x[2]) { r.w++; r.pts += 2; r.last.push('W'); }
        else if (x[1] < x[2]) { r.l++; r.last.push('L'); }
        else { r.t++; r.pts += 1; r.last.push('T'); }
      });
    });
    Object.keys(rows).forEach(function (k) {
      var r = rows[k], L = r.last, n = 0;
      for (var i = L.length - 1; i >= 0 && L[i] === L[L.length - 1]; i--) n++;
      r.streak = L.length ? L[L.length - 1] + n : '';
      r.diff = r.pf - r.pa;
    });
    return rows;
  }
  /* Points and differential in games between the teams in `group` (or division games when div is set). */
  function subRecord(season, team, group, div) {
    var pts = 0, diff = 0;
    regularGames(season).forEach(function (g) {
      var me = g.home === team ? 0 : g.away === team ? 1 : -1;
      if (me < 0) return;
      var opp = me === 0 ? g.away : g.home;
      if (group && group.indexOf(opp) < 0) return;
      if (div && divisionOf(opp) !== divisionOf(team)) return;
      var a = g.result.score[me], b = g.result.score[1 - me];
      pts += a > b ? 2 : a === b ? 1 : 0; diff += a - b;
    });
    return { pts: pts, diff: diff };
  }
  function coin(season, team) { // stable "coin flip" per season and team
    var h = 2166136261, str = season.id + team;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967296;
  }
  /* Tiebreakers: points, wins, head-to-head points, head-to-head differential,
     division-game differential, overall differential, coin flip. */
  function rank(season, list) {
    list = list.slice().sort(function (a, b) { return b.pts - a.pts || b.w - a.w; });
    var out = [], i = 0;
    while (i < list.length) {
      var j = i;
      while (j + 1 < list.length && list[j + 1].pts === list[i].pts && list[j + 1].w === list[i].w) j++;
      var tied = list.slice(i, j + 1);
      if (tied.length > 1) {
        var ids = tied.map(function (r) { return r.id; });
        tied.forEach(function (r) {
          var h = subRecord(season, r.id, ids), d = subRecord(season, r.id, null, true);
          r.tb = [h.pts, h.diff, d.diff, r.diff, coin(season, r.id)];
        });
        tied.sort(function (a, b) { for (var k = 0; k < 5; k++) if (a.tb[k] !== b.tb[k]) return b.tb[k] - a.tb[k]; return 0; });
      }
      out = out.concat(tied);
      i = j + 1;
    }
    return out;
  }
  function standings(season) {
    var rows = baseRows(season), out = {};
    ['West', 'East'].forEach(function (d) {
      out[d] = rank(season, DIVISIONS[d].map(function (t) { return rows[t]; }));
      out[d].forEach(function (r, i) { r.place = i + 1; });
    });
    return out;
  }

  /* ---------- playoffs ---------- */
  /* Top three in each division. Crossover: if the 4th-place team in one division has more points
     than the 3rd-place team in the other, it takes that spot in the other division's bracket. */
  function playoffField(season) {
    var st = standings(season), b = { West: st.West.slice(0, 3).map(function (r) { return r.id; }), East: st.East.slice(0, 3).map(function (r) { return r.id; }) };
    var crossover = null;
    if (st.West[3] && st.West[3].pts > st.East[2].pts) { b.East[2] = st.West[3].id; crossover = { team: st.West[3].id, from: 'West', to: 'East', replaced: st.East[2].id }; }
    else if (st.East[3] && st.East[3].pts > st.West[2].pts) { b.West[2] = st.East[3].id; crossover = { team: st.East[3].id, from: 'East', to: 'West', replaced: st.West[2].id }; }
    return { bracket: b, crossover: crossover };
  }
  function startPlayoffs(season) {
    var f = playoffField(season);
    season.phase = 'playoffs';
    season.playoffs = {
      bracket: f.bracket, crossover: f.crossover,
      rounds: [{ name: ROUND_NAMES[0], games: ['West', 'East'].map(function (d) {
        return { id: 'p1' + d[0], week: WEEKS + 1, div: d, label: d + ' Semi-Final', home: f.bracket[d][1], away: f.bracket[d][2], result: null };
      }) }]
    };
  }
  /* Where the season's team stands now: 'alive', 'out' (missed playoffs or knocked out), or 'champion'. */
  function teamStatus(season, team) {
    if (season.champion === team) return 'champion';
    if (!season.playoffs) return 'alive';
    var b = season.playoffs.bracket;
    if (b.West.indexOf(team) < 0 && b.East.indexOf(team) < 0) return 'out';
    var lost = false;
    season.playoffs.rounds.forEach(function (r) { r.games.forEach(function (g) { if (loserOf(g) === team) lost = true; }); });
    return lost ? 'out' : 'alive';
  }

  /* ---------- team stats ---------- */
  function teamStats(season) {
    var rows = {};
    allTeams().forEach(function (t) { rows[t] = { id: t, gp: 0, pf: 0, yds: 0, pass: 0, rush: 0, to: 0, fd: 0, sacks: 0 }; });
    regularGames(season).forEach(function (g) {
      [g.home, g.away].forEach(function (t, i) {
        var r = rows[t], x = g.result.stats && g.result.stats[i];
        r.gp++; r.pf += g.result.score[i];
        if (x) { r.yds += x.yds; r.pass += x.pass; r.rush += x.rush; r.to += x.to; r.fd += x.fd; r.sacks += x.sacks; }
      });
    });
    return allTeams().map(function (t) { return rows[t]; });
  }
  function scheduleFor(season, team) {
    var out = [];
    season.weeks.forEach(function (wk, w) {
      var g = wk.filter(function (x) { return x.home === team || x.away === team; })[0];
      out.push(g ? g : { week: w + 1, bye: true });
    });
    return out;
  }

  var api = {
    DIVISIONS: DIVISIONS, WEEKS: WEEKS, GAMES: GAMES, HOSTS: HOSTS,
    divisionOf: divisionOf, allTeams: allTeams, seeded: seeded, makeSchedule: makeSchedule, newSeason: newSeason,
    simGame: simGame, resultFromGame: resultFromGame, findGame: findGame, currentGames: currentGames, teamGame: teamGame,
    record: record, simCurrent: simCurrent, currentDone: currentDone, advance: advance,
    standings: standings, playoffField: playoffField, startPlayoffs: startPlayoffs, teamStatus: teamStatus,
    teamStats: teamStats, scheduleFor: scheduleFor, winnerOf: winnerOf, loserOf: loserOf
  };
  root.CFL = root.CFL || {};
  root.CFL.Season = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
