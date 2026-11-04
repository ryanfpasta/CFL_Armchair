/* CFL Armchair Football — game engine.
   Pure rules: no DOM. Works in the browser (window.CFL.Engine) and in Node (module.exports).
   Ball position (ballOn) is measured from the possessing team's own goal line, 0–110.
   Team index 0 = home, 1 = away. */
(function (root) {
  'use strict';

  var PLAYS = {
    SR: { name: 'Short Run', kind: 'run', table: [
      { to: 'fumble' }, { y: -2 }, { y: 0 }, { y: 2 }, { y: 3 }, { y: 4 }, { y: 4 }, { y: 5 }, { y: 6 }, { y: 8 }, { y: 15, bk: 1 }] },
    LR: { name: 'Long Run', kind: 'run', table: [
      { to: 'fumble' }, { y: -3 }, { y: -1 }, { y: 1 }, { y: 3 }, { y: 5 }, { y: 7 }, { y: 9 }, { y: 12 }, { y: 18 }, { y: 30, bk: 1 }] },
    SP: { name: 'Short Pass', kind: 'pass', table: [
      { to: 'int' }, { sack: 6 }, { inc: 1 }, { y: 3 }, { y: 5 }, { y: 6 }, { y: 7 }, { y: 8 }, { y: 10 }, { y: 12 }, { y: 20 }] },
    LP: { name: 'Long Pass', kind: 'pass', table: [
      { to: 'int' }, { to: 'int' }, { sack: 8 }, { inc: 1 }, { inc: 1 }, { y: 12 }, { y: 18 }, { y: 25 }, { y: 32 }, { y: 40 }, { y: 55 }] },
    /* Trick plays, 3rd down only. The punter runs, or the holder throws. Fools the defence on 8+ (5 in 12). */
    FAKE_PUNT: { name: 'Fake Punt', kind: 'run', fake: 1, table: [
      { to: 'fumble' }, { y: -3 }, { y: -1 }, { y: 0 }, { y: 1 }, { y: 2 }, { y: 12 }, { y: 15 }, { y: 20 }, { y: 30, bk: 1 }, { y: 110, bk: 1 }] },
    FAKE_FG: { name: 'Fake Field Goal', kind: 'pass', fake: 1, table: [
      { to: 'int' }, { sack: 4 }, { sack: 2 }, { inc: 1 }, { inc: 1 }, { inc: 1 }, { y: 10 }, { y: 14 }, { y: 18 }, { y: 25 }, { y: 110 }] },
    KNEEL: { name: 'Kneel Down', kind: 'run' }
  };
  var KICKOFF = ['fumble', 25, 30, 35, 35, 35, 40, 45, 50, 55, 'td'];
  var PUNT = [15, 25, 30, 35, 38, 40, 42, 45, 48, 52, 58];
  var RETURN = ['fumble', 0, 2, 5, 8, 10, 12, 15, 20, 30, 'td'];

  /* Seconds of game time per play. "Running" values include the huddle runoff.
     When the clock is stopped before the snap (after a timeout, or in the last 3 minutes
     of a half) running plays, completions and sacks burn only STOPPED seconds. */
  var TIME = { run: 35, complete: 35, inc: 8, sack: 30, turnover: 15, kick: 10, kneel: 40, convert: 0, stopped: 10 };
  var QUARTER_SECONDS = 900;

  function fgNeed(dist) {
    if (dist < 20) return 3;
    if (dist < 30) return 4;
    if (dist < 40) return 5;
    if (dist < 50) return 6;
    if (dist < 60) return 8;
    return 10;
  }
  function fgDistance(s) { return 110 - s.ballOn + 7; }

  function roll(rng) { return [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)]; }
  function other(i) { return 1 - i; }

  function mkStats() {
    return { pts: [0, 0, 0, 0, 0], yards: 0, passYds: 0, rushYds: 0, firstDowns: 0, ints: 0, fumbles: 0,
      sacks: 0, third: [0, 0], punts: 0, puntYds: 0, fg: [0, 0], top: 0, plays: 0 };
  }

  function newGame(opts) {
    return {
      v: 1,
      id: 'g' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
      created: new Date().toISOString(),
      mode: opts.mode || 'solo',
      teams: [opts.home, opts.away],
      ctrl: opts.ctrl || ['human', 'cpu'],
      score: [0, 0],
      quarter: 1, clock: QUARTER_SECONDS, clockStopped: false, warned: { 2: false, 4: false },
      poss: 0, ballOn: 35, down: 1, ltg: 45,
      timeouts: [2, 2],
      phase: 'coin', kicker: null, openingReceiver: null,
      ot: null, winner: null,
      stats: [mkStats(), mkStats()],
      log: [], playYards: [[], []], seq: 0
    };
  }

  /* ---------- helpers ---------- */
  function abbr(s, i) { return s.teams[i]; }
  function lateHalf(s) { return (s.quarter === 2 || s.quarter === 4) && s.clock <= 180; }
  function clockIsStopped(s) { return s.quarter > 4 || s.clockStopped || lateHalf(s); }
  function toGo(s) { return s.ltg - s.ballOn; }
  function ord(n) { return ['', '1st', '2nd', '3rd'][n] || n + 'th'; }
  function fmtClock(sec) { var m = Math.floor(sec / 60), x = sec % 60; return m + ':' + (x < 10 ? '0' : '') + x; }
  function qLabel(q) { return q <= 4 ? 'Q' + q : 'OT'; }

  /* "the CGY 40", "the 55" */
  function spotName(s, team, ballOn) {
    if (ballOn === 55) return 'the 55';
    if (ballOn < 55) return 'the ' + abbr(s, team) + ' ' + ballOn;
    return 'the ' + abbr(s, other(team)) + ' ' + (110 - ballOn);
  }
  function downDistance(s) {
    var g = s.ltg >= 110 ? 'Goal' : String(toGo(s));
    return ord(s.down) + ' & ' + g;
  }
  function situation(s) { return downDistance(s) + ' at ' + spotName(s, s.poss, s.ballOn); }

  function setFirst(s) { s.down = 1; s.ltg = Math.min(s.ballOn + 10, 110); }
  function giveBall(s, team, ballOn) { s.poss = team; s.ballOn = ballOn; setFirst(s); s.phase = 'play'; }

  function addPoints(s, team, pts) {
    s.score[team] += pts;
    s.stats[team].pts[s.quarter <= 4 ? s.quarter - 1 : 4] += pts;
  }

  function burn(s, r, base, shortenable, topTeam) {
    if (s.quarter > 4) return 0;
    var t = (shortenable && clockIsStopped(s)) ? TIME.stopped : base;
    var before = s.clock, after = Math.max(0, before - t);
    if ((s.quarter === 2 || s.quarter === 4) && !s.warned[s.quarter] && before > 180 && after <= 180) {
      after = 180;
      s.warned[s.quarter] = true;
      r.events.push({ type: 'warning', text: '3-minute warning' });
    }
    s.clock = after;
    s.stats[topTeam].top += before - after;
    s.clockStopped = lateHalf(s);
    r.seconds = before - after;
    return before - after;
  }

  /* ---------- scoring outcomes ---------- */
  function touchdown(s, r, team) {
    addPoints(s, team, 6);
    s.poss = team;
    s.phase = 'convert';
    r.score = { type: 'TD', team: team, pts: 6 };
  }
  function kickoffBy(s, team) { s.phase = 'kickoff'; s.kicker = team; }
  function safety(s, r, conceding) {
    var t = other(conceding);
    addPoints(s, t, 2);
    r.score = { type: 'SAFETY', team: t, pts: 2 };
    if (s.ot) return endOTPossession(s, r);
    kickoffBy(s, conceding);
  }
  function rouge(s, r, kicking) {
    addPoints(s, kicking, 1);
    r.score = { type: 'ROUGE', team: kicking, pts: 1 };
    if (s.ot) return endOTPossession(s, r);
    giveBall(s, other(kicking), 35);
  }
  function turnoverAt(s, r, newTeam, ballOn) {
    if (s.ot) return endOTPossession(s, r);
    giveBall(s, newTeam, ballOn);
  }

  /* ---------- overtime (CFL shootout) ---------- */
  function startOT(s, r) {
    var first = other(s.openingReceiver);
    s.quarter = 5;
    s.clock = 0;
    s.clockStopped = true;
    s.ot = { round: 1, order: [first, other(first)], idx: 0 };
    r.events.push({ type: 'ot', text: 'Tied after four quarters. Overtime shootout: each team starts at the opponent\'s 35.' });
    startOTPossession(s, r);
  }
  function startOTPossession(s, r) {
    giveBall(s, s.ot.order[s.ot.idx], 75);
    r.events.push({ type: 'otposs', text: 'OT round ' + s.ot.round + ': ' + abbr(s, s.poss) + ' ball, 1st & 10 at ' + spotName(s, s.poss, 75) });
  }
  function endOTPossession(s, r) {
    s.ot.idx++;
    if (s.ot.idx >= 2) {
      if (s.score[0] !== s.score[1]) return finish(s, r);
      s.ot.round++;
      s.ot.idx = 0;
    }
    startOTPossession(s, r);
  }

  function finish(s, r) {
    s.phase = 'final';
    s.winner = s.score[0] === s.score[1] ? null : (s.score[0] > s.score[1] ? 0 : 1);
    r.events.push({ type: 'final', text: 'Final: ' + abbr(s, 0) + ' ' + s.score[0] + ', ' + abbr(s, 1) + ' ' + s.score[1] +
      (s.ot ? ' (OT)' : '') });
  }

  function endQuarter(s, r) {
    var q = s.quarter;
    if (q === 1 || q === 3) {
      r.events.push({ type: 'quarter', text: 'End of the ' + ord(q) + ' quarter' });
      s.quarter++;
      s.clock = QUARTER_SECONDS;
      s.clockStopped = false;
    } else if (q === 2) {
      r.events.push({ type: 'half', text: 'Halftime. ' + abbr(s, other(s.openingReceiver)) + ' will receive the second-half kickoff.' });
      s.quarter = 3;
      s.clock = QUARTER_SECONDS;
      s.clockStopped = false;
      kickoffBy(s, s.openingReceiver);
    } else if (q === 4) {
      r.events.push({ type: 'quarter', text: 'End of regulation' });
      if (s.score[0] === s.score[1]) startOT(s, r); else finish(s, r);
    }
  }
  function postPlay(s, r) {
    if (s.phase !== 'convert' && s.phase !== 'final' && s.quarter <= 4 && s.clock === 0) endQuarter(s, r);
  }

  /* ---------- actions ---------- */
  function availableActions(s) {
    var A = [];
    if (s.phase === 'kickoff') {
      A.push({ id: 'KICKOFF', label: 'Kick Off', enabled: true });
      var late = (s.quarter === 2 || s.quarter === 4) && s.clock <= 180;
      A.push({ id: 'ONSIDE', label: 'Onside Kick', enabled: late,
        reason: late ? 'Recover on 11+ (1 in 12)' : 'Last 3 minutes of a half only' });
    } else if (s.phase === 'convert') {
      A.push({ id: 'CONV1', label: '1-pt Kick', enabled: true, reason: 'Good on 3+' });
      A.push({ id: 'CONV2', label: '2-pt Play', enabled: true, reason: 'Good on 8+' });
    } else if (s.phase === 'play') {
      A.push({ id: 'SR', label: 'Short Run', enabled: true });
      A.push({ id: 'LR', label: 'Long Run', enabled: true });
      A.push({ id: 'SP', label: 'Short Pass', enabled: true });
      A.push({ id: 'LP', label: 'Long Pass', enabled: true });
      A.push({ id: 'PUNT', label: 'Punt', enabled: !s.ot, reason: s.ot ? 'No punts in overtime' : '' });
      var d = fgDistance(s);
      A.push({ id: 'FG', label: 'Field Goal', enabled: d <= 60,
        reason: d <= 60 ? d + ' yds, good on ' + fgNeed(d) + '+' : 'Out of range (' + d + ' yds)' });
      var third = s.down === 3;
      A.push({ id: 'FAKE_PUNT', label: 'Fake Punt', enabled: third && !s.ot,
        reason: s.ot ? 'No punts in overtime' : third ? 'Fools them on 8+' : '3rd down only' });
      A.push({ id: 'FAKE_FG', label: 'Fake Field Goal', enabled: third && d <= 60,
        reason: !third ? '3rd down only' : d <= 60 ? 'Fools them on 8+' : 'Out of field-goal range' });
      A.push({ id: 'KNEEL', label: 'Kneel Down', enabled: true, reason: '−1 yd, 40 sec' });
      var toReason = '';
      if (s.quarter > 4) toReason = 'No clock in overtime';
      else if (s.timeouts[s.poss] <= 0) toReason = 'No timeouts left';
      else if (clockIsStopped(s)) toReason = 'Clock already stopped';
      A.push({ id: 'TIMEOUT', label: 'Timeout (' + s.timeouts[s.poss] + ')', enabled: !toReason, reason: toReason });
    }
    return A;
  }

  function actingTeam(s) { return s.phase === 'kickoff' ? s.kicker : s.poss; }

  function act(s, id, rng) {
    rng = rng || Math.random;
    var a = availableActions(s).filter(function (x) { return x.id === id; })[0];
    if (!a || !a.enabled) throw new Error('Action not available: ' + id + (a && a.reason ? ' (' + a.reason + ')' : ''));
    var snap = { q: s.quarter, clock: s.clock, team: actingTeam(s) };
    var r = { action: id, team: snap.team, rolls: [], events: [], headline: '', logText: '', yards: null, score: null, seconds: 0 };
    if (id === 'TIMEOUT') doTimeout(s, r);
    else if (id === 'KICKOFF') doKickoff(s, r, rng);
    else if (id === 'ONSIDE') doOnside(s, r, rng);
    else if (id === 'CONV1' || id === 'CONV2') doConvert(s, r, rng, id === 'CONV2');
    else if (id === 'PUNT') doPunt(s, r, rng);
    else if (id === 'FG') doFieldGoal(s, r, rng);
    else doScrimmage(s, r, rng, id);
    if (id !== 'TIMEOUT') postPlay(s, r);

    s.seq++;
    s.log.push({ n: s.seq, q: snap.q, clock: snap.clock, team: snap.team, text: r.logText, yards: r.yards });
    r.events.forEach(function (e) { s.log.push({ n: s.seq, q: s.quarter, clock: s.clock, team: null, text: e.text, event: e.type }); });
    s.last = { headline: r.headline, rolls: r.rolls, team: r.team, action: id, seq: s.seq };
    return r;
  }

  function doTimeout(s, r) {
    s.timeouts[s.poss]--;
    s.clockStopped = true;
    r.headline = abbr(s, s.poss) + ' calls a timeout';
    r.logText = 'Timeout (' + s.timeouts[s.poss] + ' left), clock stopped';
  }

  function doScrimmage(s, r, rng, key) {
    var P = PLAYS[key], off = s.poss, def = other(off), st = s.stats[off];
    var los = s.ballOn, third = s.down === 3, o, dice;
    if (key === 'KNEEL') { o = { y: -1, kneel: 1 }; }
    else {
      dice = roll(rng);
      r.rolls.push({ label: P.name, dice: dice });
      o = P.table[dice[0] + dice[1] - 2];
    }
    st.plays++;
    var head, logHead, after = '';

    if (o.to) {
      if (o.to === 'int') { st.ints++; head = P.name + ' intercepted!'; logHead = P.name + ' intercepted'; }
      else { st.fumbles++; head = P.name + (P.fake ? ' — the punter fumbles, lost!' : ' — fumble, lost!'); logHead = P.name + ', fumble lost'; }
      if (third) st.third[1]++;
      r.yards = 0;
      s.playYards[off].push(0);
      burn(s, r, TIME.turnover, false, off);
      turnoverAt(s, r, def, 110 - los);
      after = s.ot ? 'possession over' : abbr(s, s.poss) + ' ball, ' + situation(s);
      r.headline = head + ' ' + abbr(s, def) + ' takes over.';
      r.logText = logHead + ', ' + after;
      return;
    }

    if (o.inc) {
      if (third) st.third[1]++;
      r.yards = 0;
      s.playYards[off].push(0);
      burn(s, r, TIME.inc, false, off);
      s.down++;
      head = P.name + ' incomplete';
      if (s.down > 3) {
        turnoverAt(s, r, def, 110 - los);
        after = 'turnover on downs' + (s.ot ? '' : ', ' + abbr(s, s.poss) + ' ball at ' + spotName(s, s.poss, s.ballOn));
        r.headline = head + ' — turnover on downs';
      } else {
        after = situation(s);
        r.headline = head + '. ' + downDistance(s) + '.';
      }
      r.logText = P.name + ' incomplete, ' + after;
      return;
    }

    var gain = o.sack ? -o.sack : o.y;
    var newPos = los + gain, credited, td = false, sf = false;
    if (newPos >= 110) { credited = 110 - los; td = true; }
    else if (newPos <= 0) { credited = -los; sf = true; }
    else credited = gain;

    if (P.kind === 'run') st.rushYds += credited; else st.passYds += credited;
    st.yards += credited;
    r.yards = credited;
    s.playYards[off].push(credited);
    if (o.sack) st.sacks++;

    if (o.kneel) { head = 'Kneel down'; logHead = 'Kneel down'; burn(s, r, TIME.kneel, false, off); }
    else if (o.sack) { head = 'Sacked — loss of ' + (-credited); logHead = 'Sacked'; burn(s, r, TIME.sack, true, off); }
    else {
      if (P.kind === 'run') {
        head = P.name + (o.bk ? ' — breakaway! ' : ' — ') + (credited > 0 ? 'gain of ' + credited : credited < 0 ? 'loss of ' + (-credited) : 'no gain');
        logHead = P.name + (o.bk ? ', breakaway' : '');
      } else {
        head = P.name + ' complete — ' + credited + ' yard' + (Math.abs(credited) === 1 ? '' : 's');
        logHead = P.name + ' complete';
      }
      burn(s, r, P.kind === 'run' ? TIME.run : TIME.complete, true, off);
    }
    if (P.fake && credited >= 10) { head = 'FAKE! They bought it — ' + head; logHead = 'FAKE! ' + logHead; }
    var signed = (credited > 0 ? '+' : '') + credited + ' yard' + (Math.abs(credited) === 1 ? '' : 's');

    if (td) {
      if (third) { st.third[0]++; st.third[1]++; }
      touchdown(s, r, off);
      r.headline = head + ', TOUCHDOWN ' + abbr(s, off) + '!';
      after = 'TOUCHDOWN';
    } else if (sf) {
      if (third) st.third[1]++;
      safety(s, r, off);
      r.headline = head + ' — SAFETY! 2 points ' + abbr(s, def) + '.';
      after = 'SAFETY, 2 points ' + abbr(s, def);
    } else {
      s.ballOn = newPos;
      if (newPos >= s.ltg) {
        st.firstDowns++;
        if (third) { st.third[0]++; st.third[1]++; }
        setFirst(s);
        r.headline = head + ', first down';
        after = '1st down at ' + spotName(s, off, s.ballOn);
      } else {
        if (third) st.third[1]++;
        s.down++;
        if (s.down > 3) {
          turnoverAt(s, r, def, 110 - newPos);
          r.headline = head + ' — short. Turnover on downs.';
          after = 'turnover on downs' + (s.ot ? '' : ', ' + abbr(s, s.poss) + ' ball at ' + spotName(s, s.poss, s.ballOn));
        } else {
          r.headline = head + '. ' + downDistance(s) + '.';
          after = situation(s);
        }
      }
    }
    r.logText = logHead + ', ' + signed + ', ' + after;
  }

  function doPunt(s, r, rng) {
    var off = s.poss, def = other(off), los = s.ballOn;
    var d1 = roll(rng), dist = PUNT[d1[0] + d1[1] - 2];
    var d2 = roll(rng), ret = RETURN[d2[0] + d2[1] - 2];
    r.rolls.push({ label: 'Punt', dice: d1 }, { label: 'Return', dice: d2 });
    var st = s.stats[off];
    st.punts++; st.puntYds += dist;
    burn(s, r, TIME.kick, false, off);
    var landing = los + dist;
    var head = 'Punt, ' + dist + ' yards' + (dist === 15 ? ' (shank)' : dist === 58 ? ' (boom)' : '');
    var tail;
    if (landing >= 110) {
      head += ' into the end zone';
      if (ret === 'fumble') {
        s.stats[def].fumbles++;
        touchdown(s, r, off);
        tail = abbr(s, def) + ' fumbles in the end zone, ' + abbr(s, off) + ' recovers — TOUCHDOWN ' + abbr(s, off);
      } else if (ret === 'td') {
        touchdown(s, r, def);
        tail = abbr(s, def) + ' returns it all the way — TOUCHDOWN ' + abbr(s, def);
      } else if (ret === 0) {
        rouge(s, r, off);
        tail = 'not returned — ROUGE, 1 point ' + abbr(s, off) + (s.ot ? '' : '. ' + abbr(s, def) + ' ball at ' + spotName(s, def, 35));
      } else {
        turnoverAt(s, r, def, ret);
        tail = 'returned ' + ret + ' yards out of the end zone' + (s.ot ? '' : ', ' + abbr(s, def) + ' ball at ' + spotName(s, def, ret));
      }
    } else {
      var caught = 110 - landing;
      if (ret === 'fumble') {
        s.stats[def].fumbles++;
        turnoverAt(s, r, off, landing);
        tail = abbr(s, def) + ' fumbles the catch, ' + abbr(s, off) + ' recovers' + (s.ot ? '' : ' at ' + spotName(s, off, landing));
      } else if (ret === 'td' || caught + ret >= 110) {
        touchdown(s, r, def);
        tail = 'punt return TOUCHDOWN ' + abbr(s, def);
      } else {
        turnoverAt(s, r, def, caught + ret);
        tail = (ret === 0 ? 'no return' : 'returned ' + ret + ' yards') + (s.ot ? '' : ', ' + abbr(s, def) + ' ball at ' + spotName(s, def, caught + ret));
      }
    }
    r.headline = head + ' — ' + tail + '.';
    r.logText = head + ', ' + tail;
  }

  function doFieldGoal(s, r, rng) {
    var off = s.poss, def = other(off), st = s.stats[off];
    var dist = fgDistance(s), need = fgNeed(dist);
    var d = roll(rng), sum = d[0] + d[1];
    r.rolls.push({ label: 'Field Goal', dice: d });
    st.fg[1]++;
    burn(s, r, TIME.kick, false, off);
    var head = dist + '-yard field goal ';
    if (sum >= need) {
      st.fg[0]++;
      addPoints(s, off, 3);
      r.score = { type: 'FG', team: off, pts: 3 };
      if (s.ot) endOTPossession(s, r); else kickoffBy(s, off);
      r.headline = head + 'is GOOD! 3 points ' + abbr(s, off) + '.';
      r.logText = head + 'GOOD';
      return;
    }
    var d2 = roll(rng), ret = RETURN[d2[0] + d2[1] - 2];
    r.rolls.push({ label: 'Return', dice: d2 });
    var tail;
    if (ret === 'fumble') {
      s.stats[def].fumbles++;
      touchdown(s, r, off);
      tail = abbr(s, def) + ' fumbles in the end zone, ' + abbr(s, off) + ' recovers — TOUCHDOWN ' + abbr(s, off);
    } else if (ret === 'td') {
      touchdown(s, r, def);
      tail = 'returned all the way — TOUCHDOWN ' + abbr(s, def);
    } else if (ret === 0) {
      rouge(s, r, off);
      tail = 'not returned — ROUGE, 1 point ' + abbr(s, off) + (s.ot ? '' : '. ' + abbr(s, def) + ' ball at ' + spotName(s, def, 35));
    } else {
      turnoverAt(s, r, def, ret);
      tail = 'returned ' + ret + ' yards' + (s.ot ? '' : ', ' + abbr(s, def) + ' ball at ' + spotName(s, def, ret));
    }
    r.headline = head + 'is NO GOOD (needed ' + need + '+) — ' + tail + '.';
    r.logText = head + 'missed, ' + tail;
  }

  function doConvert(s, r, rng, two) {
    var team = s.poss;
    var d = roll(rng), sum = d[0] + d[1], good = two ? sum >= 8 : sum >= 3;
    r.rolls.push({ label: two ? '2-pt Play' : '1-pt Kick', dice: d });
    if (good) { addPoints(s, team, two ? 2 : 1); r.score = { type: two ? 'CONV2' : 'CONV1', team: team, pts: two ? 2 : 1 }; }
    r.headline = (two ? '2-point convert ' : 'Convert kick ') + (good ? 'is GOOD!' : 'is NO GOOD.');
    r.logText = (two ? '2-point convert ' : '1-point convert kick ') + (good ? 'good' : 'no good');
    if (s.ot) endOTPossession(s, r); else kickoffBy(s, team);
  }

  function doKickoff(s, r, rng) {
    var k = s.kicker, rec = other(k);
    var d = roll(rng), v = KICKOFF[d[0] + d[1] - 2];
    r.rolls.push({ label: 'Kickoff', dice: d });
    burn(s, r, TIME.kick, false, k);
    if (v === 'fumble') {
      s.stats[rec].fumbles++;
      giveBall(s, k, 75);
      r.headline = 'Kickoff — ' + abbr(s, rec) + ' fumbles the return! ' + abbr(s, k) + ' recovers at ' + spotName(s, k, 75) + '.';
      r.logText = 'Kickoff, ' + abbr(s, rec) + ' fumbles the return, ' + abbr(s, k) + ' ball at ' + spotName(s, k, 75);
    } else if (v === 'td') {
      touchdown(s, r, rec);
      r.headline = 'Kickoff returned all the way — TOUCHDOWN ' + abbr(s, rec) + '!';
      r.logText = 'Kickoff return TOUCHDOWN ' + abbr(s, rec);
    } else {
      giveBall(s, rec, v);
      r.headline = 'Kickoff — ' + abbr(s, rec) + ' starts at ' + spotName(s, rec, v) + '.';
      r.logText = 'Kickoff, ' + abbr(s, rec) + ' ball at ' + spotName(s, rec, v);
    }
  }

  /* Onside kick: last 3 minutes of a half. Recovered by the kicking team on 2d6 of ONSIDE_NEED or more,
     at its own 45 (the ball must travel 10 yards from the 35). Otherwise the receiving team takes over there,
     at the kicking team's 45. */
  var ONSIDE_NEED = 11;
  function doOnside(s, r, rng) {
    var k = s.kicker, rec = other(k);
    var d = roll(rng), sum = d[0] + d[1];
    r.rolls.push({ label: 'Onside Kick', dice: d });
    burn(s, r, TIME.kick, false, k);
    if (sum >= ONSIDE_NEED) {
      giveBall(s, k, 45);
      r.headline = 'Onside kick — RECOVERED by ' + abbr(s, k) + '! Ball at ' + spotName(s, k, 45) + '.';
      r.logText = 'Onside kick recovered by ' + abbr(s, k) + ', ball at ' + spotName(s, k, 45);
    } else {
      giveBall(s, rec, 65);
      r.headline = 'Onside kick — ' + abbr(s, rec) + ' recovers at ' + spotName(s, rec, 65) + '.';
      r.logText = 'Onside kick, ' + abbr(s, rec) + ' recovers at ' + spotName(s, rec, 65);
    }
  }

  function coinToss(s, rng, winner) {
    rng = rng || Math.random;
    var w = (winner === 0 || winner === 1) ? winner : (rng() < 0.5 ? 0 : 1);
    s.openingReceiver = w;
    kickoffBy(s, other(w));
    var text = abbr(s, w) + ' wins the coin toss and will receive the opening kickoff.';
    s.log.push({ n: 0, q: 1, clock: s.clock, team: null, text: text, event: 'coin' });
    return { winner: w, text: text };
  }

  function logLine(s, e) {
    if (e.event) return e.text;
    return qLabel(e.q) + (e.q <= 4 ? ' ' + fmtClock(e.clock) : '') + ' — ' + abbr(s, e.team) + ': ' + e.text;
  }

  var api = {
    PLAYS: PLAYS, KICKOFF: KICKOFF, ONSIDE_NEED: ONSIDE_NEED, PUNT: PUNT, RETURN: RETURN, TIME: TIME,
    newGame: newGame, coinToss: coinToss, act: act, availableActions: availableActions,
    actingTeam: actingTeam, fgDistance: fgDistance, fgNeed: fgNeed, clockIsStopped: clockIsStopped,
    toGo: toGo, downDistance: downDistance, situation: situation, spotName: spotName,
    fmtClock: fmtClock, qLabel: qLabel, logLine: logLine, ord: ord
  };
  root.CFL = root.CFL || {};
  root.CFL.Engine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
