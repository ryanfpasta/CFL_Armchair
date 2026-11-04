/* CFL Armchair Football — computer opponent. Calls plays by down, distance, field position, score and clock. */
(function (root) {
  'use strict';
  var E = root.CFL && root.CFL.Engine ? root.CFL.Engine : (typeof require !== 'undefined' ? require('./engine.js') : null);

  function pick(weights, rng) {
    var keys = Object.keys(weights), total = 0, i;
    for (i = 0; i < keys.length; i++) total += weights[keys[i]];
    var x = rng() * total;
    for (i = 0; i < keys.length; i++) { x -= weights[keys[i]]; if (x < 0) return keys[i]; }
    return keys[keys.length - 1];
  }

  function thirdDownPlay(toGo, rng) {
    if (toGo <= 2) return pick({ SR: 70, SP: 30 }, rng);
    if (toGo <= 7) return pick({ SP: 50, LR: 25, SR: 25 }, rng);
    return pick({ LP: 60, SP: 40 }, rng);
  }

  /* Returns { id, why } */
  function decide(s, rng) {
    rng = rng || Math.random;
    if (s.phase === 'kickoff') {
      var behind = s.score[1 - s.kicker] - s.score[s.kicker];
      if (s.quarter === 4 && s.clock <= 180 && behind > 0 && (s.clock <= 120 || behind > 8))
        return { id: 'ONSIDE', why: 'trailing late, onside kick' };
      return { id: 'KICKOFF', why: 'kickoff' };
    }
    var me = s.poss, lead = s.score[me] - s.score[1 - me], q = s.quarter, clock = s.clock;
    var inOT = q > 4;
    if (s.phase === 'convert') {
      var trail = -lead; // lead already includes the 6 points just scored
      if (q === 4 && clock <= 300 && (trail === 2 || trail === 5 || trail >= 9)) return { id: 'CONV2', why: 'trailing by ' + trail + ' late, going for 2' };
      return { id: 'CONV1', why: 'take the point' };
    }
    var toGo = s.ltg - s.ballOn, down = s.down, ball = s.ballOn;
    var fgDist = E.fgDistance(s);

    // Run out the clock while leading in the last minute.
    if (!inOT && q === 4 && clock <= 60 && lead > 0 && ball > 1 && (down < 3 || clock <= 40)) return { id: 'KNEEL', why: 'leading, running out the clock' };

    // Last snap of a half in range: take the points.
    if (!inOT && (q === 2 || q === 4) && clock <= 40 && fgDist <= 50 && (q === 2 || (lead <= 0 && lead >= -3)))
      return { id: 'FG', why: 'end of half, in range' };

    if (down === 3) {
      if (toGo === 1) return { id: 'SR', why: '3rd and 1, going for it' };
      var late = q === 4 && clock < 180;
      var inRange = ball >= 75 && fgDist <= 60;
      if (inRange && toGo > 2) {
        if (inOT) {
          var secondInRound = s.ot.idx === 1;
          if (secondInRound && -lead > 3) return { id: thirdDownPlay(toGo, rng), why: 'OT, need a touchdown' };
          return { id: 'FG', why: 'OT field goal' };
        }
        if (late && -lead > 3) {
          if (toGo <= 10 && rng() < 0.3) return { id: 'FAKE_FG', why: 'trailing late, fake field goal' };
          return { id: thirdDownPlay(toGo, rng), why: 'trailing by more than 3 late, going for it' };
        }
        // The occasional surprise, never when the kick would win or tie it late.
        if (toGo <= 3 && !late && rng() < 0.05) return { id: 'FAKE_FG', why: 'surprise fake field goal' };
        return { id: 'FG', why: '3rd down in field-goal range' };
      }
      if (inRange) return { id: thirdDownPlay(toGo, rng), why: '3rd and short in range, going for it' };
      if (inOT) return { id: thirdDownPlay(toGo, rng), why: 'OT, no punting' };
      if (late && lead < 0 && -lead <= 8) return { id: thirdDownPlay(toGo, rng), why: 'trailing late, going for it' };
      // Down two scores late: a punt won't get it back, so roll the dice on a fake.
      if (late && -lead > 8 && toGo <= 12) return { id: 'FAKE_PUNT', why: 'trailing by two scores late, fake punt' };
      // The occasional surprise from midfield on 3rd and short, but not when protecting a late lead.
      if (toGo <= 4 && ball >= 45 && ball <= 75 && !(lead > 0 && q === 4) && rng() < 0.06)
        return { id: 'FAKE_PUNT', why: 'surprise fake punt' };
      return { id: 'PUNT', why: '3rd down out of range, punt' };
    }

    var w;
    if (ball < 10) w = { SR: 50, SP: 50 };
    else {
      w = { SR: 30, LR: 15, SP: 30, LP: 25 };
      if (ball >= 90) delete w.LP;
    }
    return { id: pick(w, rng), why: ord(down) + ' down' };
  }
  function ord(n) { return ['', '1st', '2nd', '3rd'][n]; }

  var api = { decide: decide, pick: pick };
  root.CFL = root.CFL || {};
  root.CFL.AI = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
