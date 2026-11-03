/* CFL Armchair Football — user interface. */
(function () {
  'use strict';
  var E = CFL.Engine, AI = CFL.AI, T = CFL.Teams, S = CFL.Season;
  var KEY_SEASON = 'cflArmchair.season';
  var KEY_CUR = 'cflArmchair.current', KEY_HIST = 'cflArmchair.history', KEY_PREF = 'cflArmchair.prefs', KEY_ART = 'cflArmchair.helmetArt';
  var FAST = /[?&]fast=1/.test(location.search);
  var DICE_MS = FAST ? 0 : 600;

  var s = null;          // current game state
  var busy = false;      // animating a play
  var cpuTimer = null;
  var prefs = loadJSON(KEY_PREF) || { mute: false, speed: 'normal' };
  var setupSel = { t1: null, t2: null };
  var season = null;     // current season (season mode), saved under KEY_SEASON

  function $(id) { return document.getElementById(id); }
  function show(id, on) { $(id).hidden = !on; }
  function esc(x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------- storage (never fatal) ---------- */
  function loadJSON(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  function removeKey(k) { try { localStorage.removeItem(k); } catch (e) { } }
  function saveGame() {
    if (!s || s.phase === 'final') return;
    if (s.seasonGame) { if (season && season.id === s.seasonGame.season) { season.live = s; saveSeason(); } }
    else saveJSON(KEY_CUR, s);
  }
  function saveSeason() { if (season) saveJSON(KEY_SEASON, season); }
  function history() { return loadJSON(KEY_HIST) || []; }

  /* ---------- sound & haptics ---------- */
  var actx = null;
  function beep(freq, dur, type, when) {
    if (prefs.mute) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var o = actx.createOscillator(), g = actx.createGain(), t0 = actx.currentTime + (when || 0);
      o.type = type || 'square'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.06, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(actx.destination); o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) { }
  }
  function soundRoll() { for (var i = 0; i < 5; i++) beep(180 + Math.random() * 200, 0.04, 'square', i * 0.1); }
  function soundWhistle() { beep(2100, 0.25, 'sine'); beep(2300, 0.35, 'sine', 0.28); }
  function soundScore() { [523, 659, 784, 1046].forEach(function (f, i) { beep(f, 0.18, 'triangle', i * 0.13); }); }
  function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { } }

  /* ---------- team helpers ---------- */
  function team(i) { return T.byId[s.teams[i]]; }
  function textOn(hex) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '#111' : '#fff';
  }
  /* A colour for play buttons that reads on the dark UI: primary, unless it is black. */
  function btnColour(t) { return t.primary === '#000000' ? t.secondary : t.primary; }
  function isHuman(i) { return s.ctrl[i] === 'human'; }

  /* ---------- screens ---------- */
  function screen(name) {
    ['start', 'setup', 'game', 'season-setup', 'season'].forEach(function (n) { show('screen-' + n, n === name); });
    window.scrollTo(0, 0);
  }

  function renderStart() {
    $('start-helmets').innerHTML = T.TEAMS.map(function (t) { return T.helmetSVG(t.id, 40); }).join('');
    var cur = loadJSON(KEY_CUR);
    if (cur && cur.v === 1 && cur.phase !== 'final' && T.byId[cur.teams[0]] && T.byId[cur.teams[1]]) {
      $('resume-summary').textContent = cur.teams[0] + ' ' + cur.score[0] + ' – ' + cur.teams[1] + ' ' + cur.score[1] +
        ' · ' + E.qLabel(cur.quarter) + (cur.quarter <= 4 ? ' ' + E.fmtClock(cur.clock) : '') +
        ' · ' + (cur.mode === 'pnp' ? 'Pass & Play' : 'Solo');
      show('resume-box', true);
      $('btn-newgame').classList.remove('btn-primary');
    } else {
      show('resume-box', false);
      $('btn-newgame').classList.add('btn-primary');
    }
    var sv = loadSeason();
    $('btn-season').textContent = sv ? 'Continue Season · ' + seasonWhen(sv) : 'Season Mode';
    screen('start');
  }

  function teamButton(t, which) {
    return '<button type="button" class="team-btn" data-team="' + t.id + '" data-which="' + which + '" aria-pressed="false">' +
      T.helmetSVG(t.id, 44) + '<span class="tname">' + esc(t.name) + '</span><span class="tcity">' + esc(t.city) + '</span>' +
      '<span class="swatch"><i style="background:' + t.primary + '"></i><i style="background:' + t.secondary + '"></i></span></button>';
  }
  function renderSetup() {
    $('grid-team1').innerHTML = T.TEAMS.map(function (t) { return teamButton(t, 't1'); }).join('');
    $('grid-team2').innerHTML = T.TEAMS.map(function (t) { return teamButton(t, 't2'); }).join('');
    syncSetup();
    renderHistory();
    screen('setup');
  }
  function syncSetup() {
    var pnp = document.querySelector('input[name=mode]:checked').value === 'pnp';
    $('lbl-team1').textContent = pnp ? 'Player 1 team' : 'Your team';
    $('lbl-team2').textContent = pnp ? 'Player 2 team' : 'Computer team';
    $('home-opt1').textContent = setupSel.t1 ? T.byId[setupSel.t1].name + (pnp ? ' (P1)' : ' (you)') : (pnp ? 'Player 1' : 'Your team');
    $('home-opt2').textContent = setupSel.t2 ? T.byId[setupSel.t2].name + (pnp ? ' (P2)' : ' (CPU)') : (pnp ? 'Player 2' : 'Computer');
    Array.prototype.forEach.call(document.querySelectorAll('.team-btn'), function (b) {
      var w = b.getAttribute('data-which'), id = b.getAttribute('data-team');
      b.setAttribute('aria-pressed', setupSel[w] === id ? 'true' : 'false');
      b.disabled = (w === 't1' && setupSel.t2 === id) || (w === 't2' && setupSel.t1 === id);
    });
  }
  function renderHistory() {
    var h = history();
    $('history-list').innerHTML = h.length ? h.slice().reverse().map(function (g) {
      var d = new Date(g.date);
      return '<li><span>' + esc(g.home) + ' ' + g.score[0] + ' – ' + esc(g.away) + ' ' + g.score[1] + (g.ot ? ' (OT)' : '') +
        ' <small>' + (g.mode === 'pnp' ? 'P&amp;P' : g.mode === 'season' ? 'Season' : 'Solo') + '</small></span><span class="hdate">' +
        d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + '</span></li>';
    }).join('') : '<li class="history-empty">No completed games yet.</li>';
    show('btn-clear-history', h.length > 0);
  }

  function startGame() {
    if (!setupSel.t1 || !setupSel.t2) { $('setup-error').textContent = 'Pick both teams.'; return; }
    $('setup-error').textContent = '';
    var mode = document.querySelector('input[name=mode]:checked').value;
    var homeIsT1 = document.querySelector('input[name=home]:checked').value === '1';
    var home = homeIsT1 ? setupSel.t1 : setupSel.t2, away = homeIsT1 ? setupSel.t2 : setupSel.t1;
    var ctrl = mode === 'pnp' ? ['human', 'human'] : (homeIsT1 ? ['human', 'cpu'] : ['cpu', 'human']);
    beginGame(E.newGame({ home: home, away: away, mode: mode, ctrl: ctrl }));
  }
  function beginGame(state) {
    s = state;
    s.uiLastActor = null;
    saveGame();
    enterGame();
  }
  function enterGame() {
    screen('game');
    buildField();
    renderAll(false);
    if (s.last) showLast();
    else { $('result').textContent = 'Welcome to Armchair Football.'; setDice([1, 1]); }
    next();
  }

  /* ---------- field ---------- */
  function yOf(teamIdx, ballOn) { return teamIdx === 0 ? 130 - ballOn : 20 + ballOn; }
  function buildField() {
    var h = team(0), a = team(1), out = [];
    out.push('<defs><pattern id="stripes" width="65" height="20" patternUnits="userSpaceOnUse"><rect width="65" height="10" fill="#2f7d32"/><rect y="10" width="65" height="10" fill="#2a7230"/></pattern></defs>');
    out.push('<rect x="0" y="20" width="65" height="110" fill="url(#stripes)"/>');
    // end zones: top = away's own end zone (home attacks it), bottom = home's own end zone
    out.push('<g id="ez-top"><rect x="0" y="0" width="65" height="20" fill="' + a.primary + '"/>' +
      '<rect x="0" y="0" width="65" height="20" fill="none" stroke="' + a.secondary + '" stroke-width="1.2"/>' +
      '<text x="32.5" y="13.5" text-anchor="middle" font-size="9" font-weight="900" fill="' + a.secondary + '" letter-spacing="1" font-family="system-ui,Arial,sans-serif">' + a.id + '</text>' +
      T.badgeSVG(a.id, 9.5, 10, 14) + T.badgeSVG(a.id, 55.5, 10, 14) + '</g>');
    out.push('<g id="ez-bot"><rect x="0" y="130" width="65" height="20" fill="' + h.primary + '"/>' +
      '<rect x="0" y="130" width="65" height="20" fill="none" stroke="' + h.secondary + '" stroke-width="1.2"/>' +
      '<text x="32.5" y="143.5" text-anchor="middle" font-size="9" font-weight="900" fill="' + h.secondary + '" letter-spacing="1" font-family="system-ui,Arial,sans-serif">' + h.id + '</text>' +
      T.badgeSVG(h.id, 9.5, 140, 14) + T.badgeSVG(h.id, 55.5, 140, 14) + '</g>');
    // yard lines every 10 from each goal line, plus the 55
    var marks = [0, 10, 20, 30, 40, 50, 55, 60, 70, 80, 90, 100, 110];
    marks.forEach(function (m) {
      var y = 130 - m, wgt = (m === 0 || m === 110) ? 0.9 : (m === 55 ? 0.6 : 0.35);
      out.push('<line x1="0" x2="65" y1="' + y + '" y2="' + y + '" stroke="#fff" stroke-width="' + wgt + '" opacity=".9"/>');
      if (m > 0 && m < 110) {
        var lab = m === 55 ? 'C' : String(m < 55 ? m : 110 - m);
        out.push('<text x="4" y="' + (y + 1.4) + '" font-size="4" fill="#fff" opacity=".85" font-family="system-ui,Arial,sans-serif" font-weight="700">' + lab + '</text>');
        out.push('<text x="61" y="' + (y + 1.4) + '" font-size="4" fill="#fff" opacity=".85" text-anchor="end" font-family="system-ui,Arial,sans-serif" font-weight="700">' + lab + '</text>');
      }
    });
    // hash marks every 5
    for (var m = 5; m < 110; m += 5) {
      if (m % 10 === 0 || m === 55) continue;
      var y = 130 - m;
      out.push('<line x1="22" x2="25" y1="' + y + '" y2="' + y + '" stroke="#fff" stroke-width=".3" opacity=".6"/><line x1="40" x2="43" y1="' + y + '" y2="' + y + '" stroke="#fff" stroke-width=".3" opacity=".6"/>');
    }
    out.push('<line id="fdline" class="fdline" x1="0" x2="65" y1="0" y2="0" stroke="#ffd400" stroke-width="1" opacity="0"/>');
    out.push('<line id="losline" class="losline" x1="0" x2="65" y1="0" y2="0" stroke="#4aa3ff" stroke-width=".8" opacity="0"/>');
    out.push('<g id="ballg" style="transform: translate(32.5px, 75px)">' +
      '<ellipse rx="3.4" ry="2.2" fill="#8b4513" stroke="#3b1d08" stroke-width=".4"/>' +
      '<line x1="-1.6" x2="1.6" y1="0" y2="0" stroke="#fff" stroke-width=".35"/>' +
      '<path id="balldir" d="M0 -6 L2 -3.6 L-2 -3.6 Z" fill="#ffd400"/></g>');
    $('field').innerHTML = out.join('');
  }
  function renderField() {
    var ball = $('ballg'), fd = $('fdline'), los = $('losline'), dir = $('balldir');
    var p = s.poss, y;
    if (s.phase === 'play') {
      y = yOf(p, s.ballOn);
      los.style.transform = 'translateY(' + y + 'px)'; los.setAttribute('opacity', '1');
      if (s.ltg < 110) { fd.style.transform = 'translateY(' + yOf(p, s.ltg) + 'px)'; fd.setAttribute('opacity', '1'); }
      else fd.setAttribute('opacity', '0');
    } else {
      los.setAttribute('opacity', '0'); fd.setAttribute('opacity', '0');
      if (s.phase === 'kickoff') y = yOf(s.kicker, 35);
      else if (s.phase === 'convert') y = yOf(p, 105);
      else y = 75;
    }
    var attackingTeam = s.phase === 'kickoff' ? s.kicker : p;
    ball.style.transform = 'translate(32.5px, ' + y + 'px)';
    dir.setAttribute('transform', attackingTeam === 0 ? '' : 'rotate(180)');
    dir.setAttribute('fill', s.phase === 'final' ? 'none' : '#ffd400');
  }
  function flashEndZone(scoringTeam) {
    // home scores in the top end zone, away in the bottom
    var g = $(scoringTeam === 0 ? 'ez-top' : 'ez-bot');
    if (!g) return;
    g.classList.remove('ez-flash'); void g.getBBox(); g.classList.add('ez-flash');
  }

  /* ---------- scoreboard ---------- */
  function sbTeam(i) {
    var t = team(i), used = 2 - s.timeouts[i], dots = '';
    for (var k = 0; k < 2; k++) dots += '<i class="' + (k < used ? 'used' : '') + '"></i>';
    return T.helmetSVG(t.id, 36, i === 1) + '<div class="sb-meta"><span class="sb-abbr">' + t.id + '</span><span class="sb-to" title="Timeouts left">' + dots + '</span></div>' +
      '<span class="sb-score">' + s.score[i] + '</span>';
  }
  function renderScoreboard() {
    [0, 1].forEach(function (i) {
      var el = $(i === 0 ? 'sb-home' : 'sb-away'), t = team(i);
      el.innerHTML = sbTeam(i);
      el.style.borderBottomColor = btnColour(t);
      el.classList.toggle('has-ball', (s.phase === 'play' || s.phase === 'convert') && s.poss === i);
    });
    $('sb-q').textContent = s.phase === 'final' ? 'FINAL' : E.qLabel(s.quarter);
    $('sb-clock').textContent = s.quarter <= 4 && s.phase !== 'final' ? E.fmtClock(s.clock) : (s.ot && s.phase !== 'final' ? 'R' + s.ot.round : '');
    $('sb-clock').parentNode.classList.toggle('stopped', E.clockIsStopped(s) && s.quarter <= 4);
    var dd, ball = '';
    if (s.phase === 'play') { dd = E.downDistance(s); ball = team(s.poss).id + ' ball on ' + E.spotName(s, s.poss, s.ballOn).replace('the ', '') + (E.clockIsStopped(s) && s.quarter <= 4 ? ' · clock stopped' : ''); }
    else if (s.phase === 'kickoff') { dd = 'Kickoff'; ball = team(s.kicker).id + ' kicking off'; }
    else if (s.phase === 'convert') { dd = 'Convert'; ball = team(s.poss).id + ' to try the convert'; }
    else if (s.phase === 'final') { dd = s.winner === null ? 'Tie' : team(s.winner).id + ' wins'; }
    else dd = 'Coin toss';
    $('sb-dd').textContent = dd;
    $('sb-ball').textContent = ball;
  }

  /* ---------- dice ---------- */
  var PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function face(el, n) {
    var on = PIPS[n], html = '';
    for (var i = 0; i < 9; i++) html += '<i class="' + (on.indexOf(i) >= 0 ? 'on' : '') + '"></i>';
    el.innerHTML = html;
    el.setAttribute('aria-label', 'Die showing ' + n);
    el.setAttribute('data-value', n);
  }
  function setDice(d) { face($('die1'), d[0]); face($('die2'), d[1]); }
  function tumble(roll, done) {
    var d1 = $('die1'), d2 = $('die2');
    $('dice-label').textContent = roll.label;
    $('dice-sum').innerHTML = '&nbsp;';
    if (!DICE_MS) { setDice(roll.dice); $('dice-sum').textContent = roll.dice[0] + roll.dice[1]; done(); return; }
    soundRoll(); vibrate(40);
    d1.classList.remove('rolling'); d2.classList.remove('rolling'); void d1.offsetWidth;
    d1.classList.add('rolling'); d2.classList.add('rolling');
    var t0 = Date.now();
    var iv = setInterval(function () {
      setDice([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
      if (Date.now() - t0 >= DICE_MS - 70) {
        clearInterval(iv);
        setDice(roll.dice);
        $('dice-sum').textContent = roll.dice[0] + roll.dice[1];
        setTimeout(done, 70);
      }
    }, 70);
  }
  function tumbleAll(rolls, done) {
    var i = 0;
    (function step() {
      if (i >= rolls.length) return done();
      tumble(rolls[i++], function () { setTimeout(step, i < rolls.length && DICE_MS ? 350 : 0); });
    })();
  }

  /* ---------- play buttons ---------- */
  function pbtn(a, colour) {
    var style = colour ? ' style="--team:' + colour + ';--team-text:' + textOn(colour) + '"' : '';
    var title = a.reason ? ' title="' + esc(a.reason) + '"' : '';
    return '<button class="pbtn" data-act="' + a.id + '"' + style + title + (a.enabled ? '' : ' disabled') + '>' + esc(a.label) +
      (a.reason ? '<small>' + esc(a.reason) + '</small>' : '') + '</button>';
  }
  function renderButtons() {
    var pane = $('buttons-pane');
    if (s.phase === 'final' || s.phase === 'coin') { pane.innerHTML = s.phase === 'final' ? '<button class="btn btn-primary btn-big" id="btn-show-box">Box Score</button>' : ''; return; }
    var actor = E.actingTeam(s), t = team(actor);
    if (!isHuman(actor)) {
      pane.innerHTML = '<div class="waiting">' + T.helmetSVG(t.id, 28) + ' ' + t.name + ' (computer) ' +
        (s.phase === 'kickoff' ? 'is kicking off…' : s.phase === 'convert' ? 'is lining up the convert…' : 'is calling a play…') + '</div>';
      return;
    }
    var acts = E.availableActions(s), by = {};
    acts.forEach(function (a) { by[a.id] = a; });
    var col = btnColour(t);
    var whose = '<div class="whose">' + (s.mode === 'pnp' ? '<b>' + t.city + ' ' + t.name + '</b> — your call' : 'Your call') + '</div>';
    if (s.phase === 'kickoff') {
      pane.innerHTML = whose + '<div class="single-action">' + pbtn(by.KICKOFF, col) + '</div>';
    } else if (s.phase === 'convert') {
      pane.innerHTML = whose + '<div class="single-action prow" style="margin-top:0">' + pbtn(by.CONV1, col) + pbtn(by.CONV2, col) + '</div>';
    } else {
      pane.innerHTML = whose + '<div class="play-groups">' +
        '<div class="pgroup"><h4>Run</h4>' + pbtn(lbl(by.SR, 'Short'), col) + pbtn(lbl(by.LR, 'Long'), col) + '</div>' +
        '<div class="pgroup"><h4>Pass</h4>' + pbtn(lbl(by.SP, 'Short'), col) + pbtn(lbl(by.LP, 'Long'), col) + '</div>' +
        '<div class="pgroup"><h4>Kick</h4>' + pbtn(by.PUNT, col) + pbtn(lbl(by.FG, 'Field Goal'), col) + '</div>' +
        '</div><div class="prow">' + pbtn(by.KNEEL) + pbtn(by.TIMEOUT) + '</div>';
    }
    if (busy) Array.prototype.forEach.call(pane.querySelectorAll('button'), function (b) { b.disabled = true; });
  }
  function lbl(a, label) { var c = {}; for (var k in a) c[k] = a[k]; c.label = label; return c; }

  /* ---------- stats pad & log ---------- */
  function top(sec) { return E.fmtClock(sec); }
  function statsHTML() {
    var a = s.stats[0], b = s.stats[1], h = team(0).id, w = team(1).id;
    var hasOT = !!s.ot;
    var head = '<tr><th></th><th>1</th><th>2</th><th>3</th><th>4</th>' + (hasOT ? '<th>OT</th>' : '') + '<th>T</th></tr>';
    function line(i) {
      var p = s.stats[i].pts, c = '<tr><td><b style="color:var(--text)">' + team(i).id + '</b></td>';
      for (var q = 0; q < 4; q++) c += '<td>' + (s.quarter > q || s.phase === 'final' ? p[q] : '–') + '</td>';
      if (hasOT) c += '<td>' + p[4] + '</td>';
      return c + '<td class="tot">' + s.score[i] + '</td></tr>';
    }
    function row(label, f) { return '<tr><td>' + label + '</td><td>' + f(a) + '</td><td>' + f(b) + '</td></tr>'; }
    return '<table class="stats-table line-score"><thead>' + head + '</thead><tbody>' + line(0) + line(1) + '</tbody></table>' +
      '<table class="stats-table"><thead><tr><th></th><th>' + h + '</th><th>' + w + '</th></tr></thead><tbody>' +
      row('Total yards', function (x) { return x.yards; }) +
      row('Passing yards', function (x) { return x.passYds; }) +
      row('Rushing yards', function (x) { return x.rushYds; }) +
      row('First downs', function (x) { return x.firstDowns; }) +
      row('Turnovers', function (x) { return x.ints + x.fumbles; }) +
      row('&nbsp;&nbsp;Interceptions thrown', function (x) { return x.ints; }) +
      row('&nbsp;&nbsp;Fumbles lost', function (x) { return x.fumbles; }) +
      row('Sacks allowed', function (x) { return x.sacks; }) +
      row('3rd-down conv.', function (x) { return x.third[0] + '/' + x.third[1]; }) +
      row('Punts (avg)', function (x) { return x.punts + (x.punts ? ' (' + (x.puntYds / x.punts).toFixed(1) + ')' : ''); }) +
      row('Field goals', function (x) { return x.fg[0] + '/' + x.fg[1]; }) +
      row('Time of possession', function (x) { return top(x.top); }) +
      '</tbody></table>';
  }
  function renderStats() { $('tab-stats').innerHTML = statsHTML(); }
  function renderLog() {
    var items = s.log.slice().reverse().map(function (e) {
      var cls = e.event ? 'ev' : (/TOUCHDOWN|GOOD|ROUGE|SAFETY|good$/.test(e.text) ? 'sc' : '');
      var colour = e.team !== null && e.team !== undefined ? btnColour(team(e.team)) : 'transparent';
      return '<li class="' + cls + '" style="border-left-color:' + colour + '">' + esc(E.logLine(s, e)) + '</li>';
    });
    $('log').innerHTML = items.join('');
  }

  function renderAll() {
    renderScoreboard(); renderField(); renderButtons(); renderStats(); renderLog();
  }

  function showLast() {
    if (!s.last) return;
    var L = s.last, lr = L.rolls && L.rolls[L.rolls.length - 1];
    if (lr) { $('dice-label').textContent = lr.label; setDice(lr.dice); $('dice-sum').textContent = lr.dice[0] + lr.dice[1]; }
    $('result').textContent = L.headline;
  }

  /* ---------- game flow ---------- */
  function doAction(id) {
    if (busy || !s) return;
    clearTimeout(cpuTimer);
    var r;
    try { r = E.act(s, id); } catch (e) { console.warn(e); return; }
    saveGame();
    busy = true;
    renderButtons();
    $('result').className = 'result';
    $('result').textContent = id === 'TIMEOUT' ? '' : '…';
    tumbleAll(r.rolls, function () {
      var res = $('result');
      res.textContent = r.headline;
      res.className = 'result' + (r.score ? ' score' : /intercepted|fumble|Sacked|SAFETY|downs/i.test(r.headline) && !r.score ? ' bad' : '');
      if (r.score && (r.score.type === 'TD' || r.score.type === 'FG')) { soundScore(); flashEndZone(r.score.team); vibrate([60, 40, 60]); }
      else if (r.score) soundScore();
      if (id === 'TIMEOUT') { $('dice-label').innerHTML = '&nbsp;'; $('dice-sum').innerHTML = '&nbsp;'; }
      var evs = r.events.map(function (e) { return e.text; });
      if (evs.length) { toast(evs.join(' · ')); if (r.events.some(function (e) { return /warning|quarter|half|ot|final/.test(e.type); })) soundWhistle(); }
      busy = false;
      renderAll();
      next(evs.length ? 1500 : 0);
    });
  }

  function toast(text) {
    var t = $('toast'); t.textContent = text; t.hidden = false;
    clearTimeout(toast.tm); toast.tm = setTimeout(function () { t.hidden = true; }, FAST ? 50 : 3500);
  }

  function cpuDelay() { return FAST ? 5 : (prefs.speed === 'fast' ? 350 : 1100); }

  function next(extra) {
    clearTimeout(cpuTimer);
    if (!s) return;
    if (s.phase === 'coin') return showCoin();
    if (s.phase === 'final') { finishGame(); return; }
    var actor = E.actingTeam(s);
    if (!isHuman(actor)) {
      cpuTimer = setTimeout(function () {
        if (!s || busy || E.actingTeam(s) !== actor || $('screen-game').hidden || !$('ov-menu').hidden || !$('ov-art').hidden) return;
        var d = AI.decide(s);
        doAction(d.id);
      }, cpuDelay() + (FAST ? 0 : (extra || 0)));
      s.uiLastActor = actor;
      return;
    }
    if (s.mode === 'pnp' && s.uiLastActor !== actor) {
      s.uiLastActor = actor;
      saveGame();
      return showHandover(actor);
    }
    s.uiLastActor = actor;
  }

  function showHandover(i) {
    var t = team(i);
    $('handover-helmet').innerHTML = T.helmetSVG(t.id, 120);
    $('handover-title').textContent = 'Pass the device to ' + t.city + ' ' + t.name;
    $('handover-text').textContent = s.phase === 'kickoff' ? t.id + ' is kicking off.' :
      s.phase === 'convert' ? t.id + ' to try the convert.' : t.id + ' ball: ' + E.situation(s) + '.';
    $('btn-handover').textContent = 'I\'m ' + t.id + ' — Ready';
    $('btn-handover').style.background = btnColour(t);
    $('btn-handover').style.color = textOn(btnColour(t));
    $('btn-handover').style.borderColor = btnColour(t);
    show('ov-handover', true);
  }

  function showCoin() {
    var caller = s.ctrl[1] === 'human' ? 1 : 0; // away team calls it; in solo the human calls it
    if (s.mode === 'solo') caller = s.ctrl[0] === 'human' ? 0 : 1;
    var ct = team(caller);
    $('coin').classList.remove('flip');
    $('coin').textContent = 'TOSS';
    $('coin-text').textContent = ct.city + ' ' + ct.name + ', call it in the air.';
    $('coin-actions').innerHTML = '<button class="btn btn-big btn-primary" data-call="H">Heads</button><button class="btn btn-big btn-primary" data-call="T">Tails</button>';
    $('coin-actions').onclick = function (ev) {
      var b = ev.target.closest('button[data-call]'); if (!b) return;
      $('coin-actions').onclick = null;
      var side = Math.random() < 0.5 ? 'H' : 'T';
      var winner = side === b.getAttribute('data-call') ? caller : 1 - caller;
      $('coin-actions').innerHTML = '';
      $('coin').classList.add('flip');
      setTimeout(function () {
        $('coin').textContent = side === 'H' ? 'HEADS' : 'TAILS';
        var res = E.coinToss(s, null, winner);
        $('coin-text').textContent = res.text + ' ' + team(1 - winner).id + ' will receive the second-half kickoff.';
        $('coin-actions').innerHTML = '<button class="btn btn-big btn-primary" id="btn-coin-go" style="grid-column:1/-1">Kick Off</button>';
        $('btn-coin-go').onclick = function () { show('ov-coin', false); saveGame(); renderAll(); $('result').textContent = res.text; next(); };
      }, FAST ? 0 : 1150);
    };
    show('ov-coin', true);
  }

  function finishGame() {
    if (!s.savedToHistory) {
      s.savedToHistory = true;
      var h = history();
      h.push({ id: s.id, date: new Date().toISOString(), home: s.teams[0], away: s.teams[1], score: s.score.slice(), ot: !!s.ot, mode: s.seasonGame ? 'season' : s.mode });
      saveJSON(KEY_HIST, h.slice(-100));
      if (s.seasonGame) recordSeasonGame(s); else removeKey(KEY_CUR);
      soundWhistle();
    }
    setTimeout(showBox, FAST ? 0 : 900);
  }
  function showBox() {
    var w = s.winner;
    $('box-title').textContent = 'Final' + (s.ot ? ' (OT)' : '') + ': ' + team(0).id + ' ' + s.score[0] + ', ' + team(1).id + ' ' + s.score[1];
    $('box-body').innerHTML = '<div class="box-line">' + T.helmetSVG(team(w === null ? 0 : w).id, 64) +
      '<div><b>' + (w === null ? 'Tie game' : team(w).city + ' ' + team(w).name + ' win!') + '</b></div></div>' + statsHTML();
    var inSeason = !!s.seasonGame;
    $('btn-again').parentNode.hidden = inSeason;
    show('btn-box-season', inSeason);
    show('ov-box', true);
  }

  /* ---------- events ---------- */
  function bind() {
    $('btn-newgame').onclick = function () { renderSetup(); };
    $('btn-history-start').onclick = function () { renderSetup(); setTimeout(function () { $('history-box').scrollIntoView(); }, 0); };
    $('btn-resume').onclick = function () {
      var cur = loadJSON(KEY_CUR); if (!cur) return renderStart();
      s = cur; s.uiLastActor = null; enterGame();
    };
    $('btn-setup-back').onclick = renderStart;
    $('btn-start').onclick = startGame;
    $('btn-clear-history').onclick = function () { removeKey(KEY_HIST); renderHistory(); };
    document.addEventListener('change', function (ev) { if (ev.target.name === 'mode' || ev.target.name === 'home') syncSetup(); });
    $('screen-setup').addEventListener('click', function (ev) {
      var b = ev.target.closest('.team-btn'); if (!b || b.disabled) return;
      setupSel[b.getAttribute('data-which')] = b.getAttribute('data-team');
      $('setup-error').textContent = '';
      syncSetup();
    });
    $('buttons-pane').addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b || b.disabled) return;
      if (b.id === 'btn-show-box') return showBox();
      var id = b.getAttribute('data-act'); if (id) doAction(id);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.onclick = function () {
        Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (x) { x.classList.toggle('active', x === t); });
        show('tab-stats', t.getAttribute('data-tab') === 'stats');
        show('tab-log', t.getAttribute('data-tab') === 'log');
      };
    });
    $('btn-handover').onclick = function () { show('ov-handover', false); };
    $('btn-menu').onclick = function () { syncMenu(); show('ov-menu', true); };
    $('btn-menu-close').onclick = function () { show('ov-menu', false); next(); };
    $('btn-mute').onclick = function () { prefs.mute = !prefs.mute; saveJSON(KEY_PREF, prefs); syncMenu(); };
    $('btn-speed').onclick = function () { prefs.speed = prefs.speed === 'fast' ? 'normal' : 'fast'; saveJSON(KEY_PREF, prefs); syncMenu(); };
    $('btn-quit').onclick = function () {
      clearTimeout(cpuTimer); saveGame(); show('ov-menu', false);
      var inSeason = s && s.seasonGame; s = null;
      if (inSeason) renderHub(); else renderStart();
    };
    $('btn-again').onclick = function () {
      var o = s; show('ov-box', false);
      beginGame(E.newGame({ home: o.teams[0], away: o.teams[1], mode: o.mode, ctrl: o.ctrl.slice() }));
    };
    $('btn-box-new').onclick = function () { show('ov-box', false); s = null; renderSetup(); };
    $('btn-box-close').onclick = function () { show('ov-box', false); };
    window.addEventListener('pagehide', saveGame);
    document.addEventListener('visibilitychange', function () { if (document.hidden) saveGame(); });
  }
  function syncMenu() {
    $('btn-mute').textContent = 'Sound: ' + (prefs.mute ? 'Off' : 'On');
    $('btn-speed').textContent = 'Computer speed: ' + (prefs.speed === 'fast' ? 'Fast' : 'Normal');
  }

  /* ---------- custom helmet art ---------- */
  /* Built-in art (optional js/logos.js, kept out of the public repo) overlaid by the player's own choices.
     storedArt[id] = { src, mode } for a player image, or { off: true } to hide a built-in logo. */
  var storedArt = {};
  function defaults() { return window.CFL_DEFAULT_ART || {}; }
  function effectiveArt() {
    var d = defaults(), out = {}, k;
    for (k in d) out[k] = d[k];
    for (k in storedArt) { if (storedArt[k] && storedArt[k].off) delete out[k]; else if (storedArt[k]) out[k] = storedArt[k]; }
    return out;
  }
  function artRow(t) {
    var c = T.getCustomArt()[t.id], d = defaults()[t.id];
    var restore = d && (!c || c.src !== d.src) ? '<button class="btn btn-ghost" data-restore="' + t.id + '">Use built-in logo</button>' : '';
    return '<div class="art-row" data-team="' + t.id + '">' + T.helmetSVG(t.id, 76) +
      '<div><div class="art-name">' + esc(t.city + ' ' + t.name) + '</div><div class="art-ctrls">' +
      '<label class="btn">' + (c ? 'Replace image' : 'Choose image') + '<input type="file" accept="image/*" data-file="' + t.id + '"></label>' +
      (c ? '<select data-mode="' + t.id + '" aria-label="Where to show the image"><option value="decal"' + (c.mode !== 'full' ? ' selected' : '') + '>On helmet</option><option value="full"' + (c.mode === 'full' ? ' selected' : '') + '>Whole helmet</option></select>' +
        '<button class="btn btn-ghost" data-remove="' + t.id + '">' + (d ? 'Use drawn emblem' : 'Remove') + '</button>' : '') + restore +
      '</div></div></div>';
  }
  function renderArt() { $('art-list').innerHTML = T.TEAMS.map(artRow).join(''); }
  function saveArt(map) {
    try { localStorage.setItem(KEY_ART, JSON.stringify(map)); }
    catch (e) { $('art-error').textContent = 'Could not save: this browser is out of storage space. Try a smaller image.'; return false; }
    storedArt = map;
    T.setCustomArt(effectiveArt());
    return true;
  }
  /* Downscale to at most 320 px on the long side and store as PNG, so storage stays small and transparency is kept. */
  function loadImageFile(file, cb) {
    var fr = new FileReader();
    fr.onerror = function () { cb('Could not read that file.'); };
    fr.onload = function () {
      var img = new Image();
      img.onerror = function () { cb('That file is not an image this browser can open.'); };
      img.onload = function () {
        var max = 320, w = img.naturalWidth || max, h = img.naturalHeight || max, k = Math.min(1, max / Math.max(w, h));
        var cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        var out;
        try { out = cv.toDataURL('image/png'); } catch (e) { out = fr.result; }
        cb(null, out);
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  }
  function openArt() { $('art-error').textContent = ''; renderArt(); show('ov-art', true); }
  function refreshHelmets() {
    if (!$('screen-start').hidden) $('start-helmets').innerHTML = T.TEAMS.map(function (t) { return T.helmetSVG(t.id, 40); }).join('');
    if (!$('screen-setup').hidden) {
      $('grid-team1').innerHTML = T.TEAMS.map(function (t) { return teamButton(t, 't1'); }).join('');
      $('grid-team2').innerHTML = T.TEAMS.map(function (t) { return teamButton(t, 't2'); }).join('');
      syncSetup();
    }
    if (s && !$('screen-game').hidden) { buildField(); renderAll(); }
    if (!$('screen-season').hidden) renderHub();
  }
  function bindArt() {
    $('btn-art-start').onclick = openArt;
    $('btn-art-menu').onclick = function () { show('ov-menu', false); openArt(); };
    $('btn-art-close').onclick = function () { show('ov-art', false); refreshHelmets(); if (s && !$('screen-game').hidden) next(); };
    $('art-list').addEventListener('change', function (ev) {
      var el = ev.target, map = JSON.parse(JSON.stringify(storedArt)), eff = T.getCustomArt();
      if (el.getAttribute('data-file')) {
        var id = el.getAttribute('data-file'), f = el.files && el.files[0];
        if (!f) return;
        $('art-error').textContent = '';
        loadImageFile(f, function (err, src) {
          if (err) { $('art-error').textContent = err; return; }
          map[id] = { src: src, mode: (eff[id] && eff[id].mode) || 'decal' };
          if (saveArt(map)) renderArt();
        });
      } else if (el.getAttribute('data-mode')) {
        var m = el.getAttribute('data-mode');
        if (eff[m]) { map[m] = { src: eff[m].src, mode: el.value }; if (saveArt(map)) renderArt(); }
      }
    });
    $('art-list').addEventListener('click', function (ev) {
      var map = JSON.parse(JSON.stringify(storedArt));
      var b = ev.target.closest('[data-remove]'), r = ev.target.closest('[data-restore]');
      if (b) { var id = b.getAttribute('data-remove'); if (defaults()[id]) map[id] = { off: true }; else delete map[id]; }
      else if (r) delete map[r.getAttribute('data-restore')];
      else return;
      if (saveArt(map)) renderArt();
    });
  }

  /* ---------- season mode ---------- */
  var hubTab = 'standings', scoresWeek = null, ssPick = null, simEndArmed = false;
  function loadSeason() {
    var v = loadJSON(KEY_SEASON);
    return v && v.kind === 'season' && v.v === 1 && T.byId[v.team] ? v : null;
  }
  function tname(id) { var t = T.byId[id]; return t ? t.city + ' ' + t.name : id; }
  function myRow(sv) {
    var st = S.standings(sv), r = st.West.concat(st.East).filter(function (x) { return x.id === sv.team; })[0];
    return r;
  }
  function wl(r) { return r.w + '–' + r.l + (r.t ? '–' + r.t : ''); }
  function seasonWhen(sv) {
    if (sv.phase === 'done') return 'Season ' + sv.year + ' complete';
    if (sv.phase === 'playoffs') return sv.playoffs.rounds[sv.playoffs.rounds.length - 1].name;
    return 'Week ' + sv.week + ' · ' + wl(myRow(sv));
  }
  function mini(id, size) { return T.helmetSVG(id, size || 26); }

  /* Season setup: pick a team. */
  function renderSeasonSetup() {
    ssPick = ssPick || (season && season.team) || null;
    function btn(t) {
      return '<button type="button" class="team-btn" data-ss="' + t.id + '" aria-pressed="' + (ssPick === t.id) + '">' +
        T.helmetSVG(t.id, 44) + '<span class="tname">' + esc(t.name) + '</span><span class="tcity">' + esc(t.city) + '</span></button>';
    }
    $('ss-grid-west').innerHTML = S.DIVISIONS.West.map(function (id) { return btn(T.byId[id]); }).join('');
    $('ss-grid-east').innerHTML = S.DIVISIONS.East.map(function (id) { return btn(T.byId[id]); }).join('');
    var existing = loadSeason();
    $('ss-warn').textContent = existing && existing.phase !== 'done' ? 'Starting a new season replaces your current one (' + tname(existing.team) + ', ' + seasonWhen(existing) + ').' : '';
    screen('season-setup');
  }
  function startSeason(team, year) {
    season = S.newSeason({ team: team, year: year || 1 });
    hubTab = 'standings'; scoresWeek = null;
    saveSeason();
    renderHub();
  }

  /* ---------- hub ---------- */
  function renderHub() {
    season = season || loadSeason();
    if (!season) return renderSeasonSetup();
    simEndArmed = false;
    var sv = season, me = sv.team, r = myRow(sv), status = S.teamStatus(sv, me);
    var t = T.byId[me];
    $('hub-title').textContent = 'Season ' + sv.year + ' · ' + (sv.phase === 'regular' ? 'Week ' + sv.week + ' of ' + S.WEEKS : sv.phase === 'playoffs' ? 'Playoffs' : 'Final');
    $('hub-team').innerHTML = T.helmetSVG(me, 56) + '<div><div class="hub-tname">' + esc(t.city + ' ' + t.name) + '</div>' +
      '<div class="hub-rec">' + wl(r) + ' · ' + r.pts + ' pts · ' + ordinal(r.place) + ' in the ' + r.div + '</div></div>';
    $('hub-team').style.borderLeftColor = btnColour(t);
    $('hub-next').innerHTML = nextCardHTML(sv, status);
    renderHubTab();
    screen('season');
  }
  function ordinal(n) { return n + (['th', 'st', 'nd', 'rd'][n] || 'th'); }
  function matchupHTML(g, big) {
    var sz = big ? 64 : 30;
    function nm(id) { return big ? esc(T.byId[id].name) : id; }
    return '<div class="mu">' +
      '<div class="mu-team">' + T.helmetSVG(g.away, sz, false) + '<b>' + nm(g.away) + '</b></div>' +
      '<div class="mu-at">' + (g.neutral ? 'vs' : 'at') + '</div>' +
      '<div class="mu-team">' + T.helmetSVG(g.home, sz, true) + '<b>' + nm(g.home) + '</b></div></div>';
  }
  function nextCardHTML(sv, status) {
    if (sv.phase === 'done') {
      var champ = T.byId[sv.champion], gc = sv.playoffs.rounds[2].games[0];
      return '<div class="next-card champ" style="--team:' + btnColour(champ) + '">' +
        '<div class="next-label">Season ' + sv.year + ' Grey Cup Champions</div>' + T.helmetSVG(champ.id, 110) +
        '<div class="champ-name">' + esc(champ.city + ' ' + champ.name) + '</div>' +
        '<div class="next-sub">' + esc(gc.label) + ': ' + scoreLine(gc) + '</div>' +
        (sv.champion === sv.team ? '<div class="champ-you">Your team won the Grey Cup!</div>' : '') +
        '<button class="btn btn-primary btn-big" id="btn-next-season">Play Season ' + (sv.year + 1) + ' with the ' + esc(T.byId[sv.team].name) + '</button>' +
        '<button class="btn" id="btn-new-season">New Season with Another Team</button></div>';
    }
    var label = sv.phase === 'regular' ? 'Week ' + sv.week : sv.playoffs.rounds[sv.playoffs.rounds.length - 1].name;
    var mine = S.teamGame(sv, sv.team), html = '<div class="next-card">';
    if (mine) {
      html += '<div class="next-label">' + esc(label) + (mine.label ? ' · ' + esc(mine.label) : '') + '</div>' + matchupHTML(mine, true);
      if (sv.live && sv.live.seasonGame && sv.live.seasonGame.game === mine.id) {
        var L = sv.live;
        html += '<div class="next-sub">In progress: ' + L.teams[0] + ' ' + L.score[0] + ', ' + L.teams[1] + ' ' + L.score[1] + ' · ' + E.qLabel(L.quarter) + '</div>' +
          '<button class="btn btn-primary btn-big" id="btn-play">Resume Game</button>';
      } else {
        html += '<div class="next-actions"><button class="btn btn-primary btn-big" id="btn-play">Play Game</button>' +
          '<button class="btn btn-big" id="btn-sim-mine">Sim My Game</button></div>';
      }
    } else if (playedMine(sv)) {
      var pm = playedMine(sv);
      html += '<div class="next-label">' + esc(label) + '</div>' + matchupHTML(pm, true) +
        '<div class="next-sub">Final: ' + scoreLine(pm) + '</div>' +
        '<button class="btn btn-primary btn-big" id="btn-sim-week">Finish ' + esc(label) + '</button>';
    } else {
      var why = sv.phase === 'regular' ? 'Bye week for the ' + esc(T.byId[sv.team].name) + '.' :
        status === 'out' ? (wasInPlayoffs(sv) ? 'The ' + esc(T.byId[sv.team].name) + ' have been knocked out.' : 'The ' + esc(T.byId[sv.team].name) + ' missed the playoffs.') :
        'The ' + esc(T.byId[sv.team].name) + ' have a bye as division leaders.';
      html += '<div class="next-label">' + esc(label) + '</div><div class="next-sub">' + why + '</div>' +
        '<div class="next-games">' + S.currentGames(sv).map(function (g) { return '<div class="ng">' + (g.label ? '<small>' + esc(g.label) + '</small>' : '') + matchupHTML(g, false) + '</div>'; }).join('') + '</div>' +
        '<button class="btn btn-primary btn-big" id="btn-sim-week">' + (sv.phase === 'regular' ? 'Sim Week ' + sv.week : 'Sim ' + esc(label)) + '</button>';
    }
    if (sv.phase === 'regular' && !sv.live) html += '<button class="btn btn-ghost btn-small" id="btn-sim-end">Sim to end of regular season</button>';
    return html + '</div>';
  }
  function playedMine(sv) {
    return S.currentGames(sv).filter(function (g) { return g.result && (g.home === sv.team || g.away === sv.team); })[0] || null;
  }
  function wasInPlayoffs(sv) { var b = sv.playoffs.bracket; return b.West.indexOf(sv.team) >= 0 || b.East.indexOf(sv.team) >= 0; }
  function scoreLine(g) {
    var r = g.result; if (!r) return '';
    return g.away + ' ' + r.score[1] + ', ' + g.home + ' ' + r.score[0] + (r.ot ? ' (OT)' : '');
  }

  function renderHubTab() {
    Array.prototype.forEach.call(document.querySelectorAll('#hub-tabs .tab'), function (b) { b.classList.toggle('active', b.getAttribute('data-htab') === hubTab); });
    var f = { standings: standingsHTML, schedule: scheduleHTML, results: scoresHTML, playoffs: playoffsHTML, stats: teamStatsHTML }[hubTab];
    $('hub-body').innerHTML = f(season);
  }
  function standingsHTML(sv) {
    var st = S.standings(sv), field = sv.playoffs ? { bracket: sv.playoffs.bracket, crossover: sv.playoffs.crossover } : S.playoffField(sv);
    function table(d) {
      return '<h3 class="div-h">' + d + ' Division</h3><table class="stats-table standings"><thead><tr><th>Team</th><th>GP</th><th>W</th><th>L</th><th>Pts</th><th>PF</th><th>PA</th><th class="hide-xs">Strk</th></tr></thead><tbody>' +
        st[d].map(function (r, i) {
          var inP = field.bracket.West.indexOf(r.id) >= 0 || field.bracket.East.indexOf(r.id) >= 0;
          var cls = (r.id === sv.team ? 'me ' : '') + (i === 2 ? 'cut ' : '') + (inP ? 'in' : '');
          var mark = field.crossover && field.crossover.team === r.id ? ' <span class="xo" title="Crossover">X</span>' : '';
          return '<tr class="' + cls + '"><td><span class="st-team">' + mini(r.id, 24) + '<span>' + r.id + mark + '</span></span></td><td>' + r.gp + '</td><td>' + r.w + '</td><td>' + r.l +
            '</td><td class="tot">' + r.pts + '</td><td>' + r.pf + '</td><td>' + r.pa + '</td><td class="hide-xs">' + r.streak + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    var note = '';
    if (field.crossover) {
      var c = field.crossover;
      note = '<p class="hub-note">' + (sv.playoffs ? '' : 'If the season ended today: ') + esc(tname(c.team)) + ' (4th in the ' + c.from + ') ' +
        (sv.playoffs ? 'crossed over' : 'would cross over') + ' to the ' + c.to + ' playoffs, taking the spot of ' + esc(tname(c.replaced)) + '.</p>';
    }
    return table('West') + table('East') + note +
      '<p class="hub-note">Top three in each division make the playoffs (highlighted). 2 points for a win. Ties in the standings go to head-to-head record, then point differential.</p>';
  }
  function scheduleHTML(sv) {
    var me = sv.team, rows = S.scheduleFor(sv, me).map(function (g) {
      var cur = sv.phase === 'regular' && g.week === sv.week ? ' class="cur"' : '';
      if (g.bye) return '<tr' + cur + '><td>' + g.week + '</td><td colspan="2" class="muted">Bye</td></tr>';
      return '<tr' + cur + '><td>' + g.week + '</td><td><span class="st-team">' + (g.home === me ? 'vs ' : '@ ') + mini(g.home === me ? g.away : g.home, 22) +
        '<span>' + esc(T.byId[g.home === me ? g.away : g.home].name) + '</span></span></td><td>' + myResult(g, me) + '</td></tr>';
    });
    if (sv.playoffs) sv.playoffs.rounds.forEach(function (r) {
      r.games.forEach(function (g) {
        if (g.home !== me && g.away !== me) return;
        rows.push('<tr class="po"><td>' + esc(r.name === 'Grey Cup' ? 'GC' : r.name === 'Division Finals' ? 'Final' : 'Semi') + '</td><td><span class="st-team">' + (g.home === me ? 'vs ' : '@ ') +
          mini(g.home === me ? g.away : g.home, 22) + '<span>' + esc(T.byId[g.home === me ? g.away : g.home].name) + '</span></span></td><td>' + myResult(g, me) + '</td></tr>');
      });
    });
    return '<table class="stats-table sched"><thead><tr><th>Wk</th><th>Opponent</th><th>Result</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>';
  }
  function myResult(g, me) {
    if (!g.result) return '<span class="muted">–</span>';
    var i = g.home === me ? 0 : 1, a = g.result.score[i], b = g.result.score[1 - i];
    return '<b class="' + (a > b ? 'win' : 'loss') + '">' + (a > b ? 'W' : a < b ? 'L' : 'T') + '</b> ' + a + '–' + b + (g.result.ot ? ' OT' : '');
  }
  function lastScoredWeek(sv) {
    var w = 0; sv.weeks.forEach(function (wk, i) { if (wk.some(function (g) { return g.result; })) w = i + 1; });
    return w;
  }
  function gameRowHTML(g) {
    var r = g.result, me = season.team;
    var hw = r.score[0] > r.score[1];
    var detail = r.stats ? '<tr class="gdetail" hidden><td colspan="3"><table class="stats-table mini-box"><thead><tr><th></th><th>' + g.away + '</th><th>' + g.home + '</th></tr></thead><tbody>' +
      [['Total yards', 'yds'], ['Passing', 'pass'], ['Rushing', 'rush'], ['First downs', 'fd'], ['Turnovers', 'to']].map(function (x) {
        return '<tr><td>' + x[0] + '</td><td>' + r.stats[1][x[1]] + '</td><td>' + r.stats[0][x[1]] + '</td></tr>';
      }).join('') + '</tbody></table></td></tr>' : '';
    return '<tbody class="grow' + (g.home === me || g.away === me ? ' me' : '') + '"><tr class="gline" tabindex="0"><td class="g-team' + (!hw ? ' w' : '') + '">' + mini(g.away, 24) + '<span>' + g.away + '</span><b>' + r.score[1] + '</b></td>' +
      '<td class="g-at">' + (g.neutral ? 'vs' : '@') + (r.ot ? '<small>OT</small>' : '') + (r.played ? '<small>played</small>' : '') + '</td>' +
      '<td class="g-team' + (hw ? ' w' : '') + '"><b>' + r.score[0] + '</b><span>' + g.home + '</span>' + mini(g.home, 24) + '</td></tr>' + detail + '</tbody>';
  }
  function gamesTable(games) {
    return '<table class="games">' + games.filter(function (g) { return g.result; }).map(gameRowHTML).join('') + '</table>';
  }
  function scoresHTML(sv) {
    var last = lastScoredWeek(sv);
    if (!last) return '<p class="hub-note">No games played yet.</p>';
    var w = scoresWeek && scoresWeek <= last ? scoresWeek : last;
    return '<div class="week-pick"><button class="btn btn-small" data-wk="' + (w - 1) + '"' + (w <= 1 ? ' disabled' : '') + '>‹</button><b>Week ' + w + '</b>' +
      '<button class="btn btn-small" data-wk="' + (w + 1) + '"' + (w >= last ? ' disabled' : '') + '>›</button></div>' +
      gamesTable(sv.weeks[w - 1]) +
      '<p class="hub-note">Tap a game for its team stats.</p>';
  }
  function playoffsHTML(sv) {
    var field = sv.playoffs ? { bracket: sv.playoffs.bracket, crossover: sv.playoffs.crossover } : S.playoffField(sv);
    var pre = !sv.playoffs ? '<p class="hub-note">If the season ended today:</p>' : '';
    function game(label, home, away, g) {
      var res = g && g.result, wid = res ? S.winnerOf(g) : null;
      function side(id, sc) {
        if (!id) return '<div class="bk-team tbd">TBD</div>';
        return '<div class="bk-team' + (wid === id ? ' w' : wid ? ' l' : '') + (id === sv.team ? ' me' : '') + '">' + mini(id, 22) + '<span>' + esc(T.byId[id].name) + '</span>' + (res ? '<b>' + sc + '</b>' : '') + '</div>';
      }
      return '<div class="bk-game"><div class="bk-label">' + esc(label) + '</div>' + side(away, res ? res.score[1] : '') + side(home, res ? res.score[0] : '') + '</div>';
    }
    function round(i, d) { return sv.playoffs && sv.playoffs.rounds[i] ? sv.playoffs.rounds[i].games.filter(function (g) { return g.div === d; })[0] : null; }
    function division(d) {
      var b = field.bracket[d], semi = round(0, d), fin = round(1, d);
      return '<div class="bk-div"><h3 class="div-h">' + d + '</h3>' +
        game('Semi-Final', b[1], b[2], semi) +
        game('Final', b[0], fin ? fin.away : null, fin) + '</div>';
    }
    var gc = sv.playoffs && sv.playoffs.rounds[2] ? sv.playoffs.rounds[2].games[0] : null;
    var xo = field.crossover ? '<p class="hub-note">Crossover: ' + esc(tname(field.crossover.team)) + ' plays in the ' + field.crossover.to + ' bracket.</p>' : '';
    return pre + '<div class="bracket">' + division('West') + division('East') + '</div>' +
      '<div class="bk-gc">' + game('Grey Cup at ' + sv.host, gc ? gc.home : null, gc ? gc.away : null, gc) + '</div>' + xo +
      '<p class="hub-note">2nd hosts 3rd in the semi-finals; the 1st-place team has a bye and hosts the final. The Grey Cup is at a neutral site.</p>';
  }
  function teamStatsHTML(sv) {
    var rows = S.teamStats(sv).filter(function (r) { return r.gp; });
    if (!rows.length) return '<p class="hub-note">No games played yet.</p>';
    function pg(x, r) { return (x / r.gp).toFixed(1); }
    rows.sort(function (a, b) { return b.pf / b.gp - a.pf / a.gp; });
    return '<table class="stats-table tstats"><thead><tr><th>Team</th><th>Pts/G</th><th>Yds/G</th><th>Pass/G</th><th>Rush/G</th><th>TO</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr' + (r.id === sv.team ? ' class="me"' : '') + '><td><span class="st-team">' + mini(r.id, 22) + '<span>' + r.id + '</span></span></td><td class="tot">' + pg(r.pf, r) + '</td><td>' + pg(r.yds, r) + '</td><td>' + pg(r.pass, r) + '</td><td>' + pg(r.rush, r) + '</td><td>' + r.to + '</td></tr>';
      }).join('') + '</tbody></table><p class="hub-note">Regular season, per game. TO = turnovers (interceptions thrown + fumbles lost).</p>';
  }

  /* ---------- playing and simming ---------- */
  function playSeasonGame() {
    var g = S.teamGame(season, season.team);
    if (!g) return;
    if (season.live && season.live.seasonGame && season.live.seasonGame.game === g.id) {
      s = season.live; s.uiLastActor = null; enterGame(); return;
    }
    var ctrl = g.home === season.team ? ['human', 'cpu'] : ['cpu', 'human'];
    var st = E.newGame({ home: g.home, away: g.away, mode: 'solo', ctrl: ctrl });
    st.seasonGame = { season: season.id, game: g.id, label: (g.label || 'Week ' + g.week) };
    beginGame(st);
    $('result').textContent = st.seasonGame.label + ': ' + tname(g.away) + (g.neutral ? ' vs ' : ' at ') + tname(g.home) + '.';
  }
  function recordSeasonGame(st) {
    season = season || loadSeason();
    if (!season || season.id !== st.seasonGame.season) return;
    var g = S.findGame(season, st.seasonGame.game);
    if (g && !g.result) S.record(season, g.id, S.resultFromGame(st));
    season.live = null;
    saveSeason();
  }
  /* Sim the rest of the current week/round, then show the results. */
  function finishRound() {
    var label = season.phase === 'regular' ? 'Week ' + season.week + ' Results' : season.playoffs.rounds[season.playoffs.rounds.length - 1].name;
    S.simCurrent(season);
    saveSeason();
    var games = S.currentGames(season).slice();
    $('week-title').textContent = label;
    $('week-note').textContent = roundNote(games);
    $('week-body').innerHTML = gamesTable(games);
    show('ov-week', true);
  }
  function roundNote(games) {
    var me = season.team, g = games.filter(function (x) { return x.home === me || x.away === me; })[0];
    if (!g) return season.phase === 'regular' ? 'The ' + T.byId[me].name + ' had the week off.' : '';
    var won = S.winnerOf(g) === me;
    if (season.phase === 'playoffs') {
      var name = season.playoffs.rounds[season.playoffs.rounds.length - 1].name;
      if (name === 'Grey Cup') return won ? 'The ' + T.byId[me].name + ' win the Grey Cup!' : 'The ' + T.byId[me].name + ' fall in the Grey Cup.';
      return won ? 'The ' + T.byId[me].name + ' advance!' : 'The ' + T.byId[me].name + ' are eliminated.';
    }
    return (won ? 'Win' : 'Loss') + ' for the ' + T.byId[me].name + '.';
  }
  function continueRound() {
    show('ov-week', false);
    var wasRegular = season.phase === 'regular';
    S.advance(season);
    saveSeason();
    if (wasRegular && season.phase === 'playoffs') hubTab = 'playoffs';
    if (season.phase === 'done') hubTab = 'playoffs';
    scoresWeek = null;
    renderHub();
  }
  function simToEnd() {
    while (season.phase === 'regular') { S.simCurrent(season); S.advance(season); }
    season.live = null;
    saveSeason();
    hubTab = 'playoffs';
    renderHub();
  }

  function bindSeason() {
    $('btn-season').onclick = function () { season = loadSeason(); if (season) renderHub(); else renderSeasonSetup(); };
    $('btn-ss-back').onclick = function () { if (loadSeason()) { season = loadSeason(); renderHub(); } else renderStart(); };
    $('screen-season-setup').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-ss]'); if (!b) return;
      ssPick = b.getAttribute('data-ss');
      Array.prototype.forEach.call(document.querySelectorAll('[data-ss]'), function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-ss') === ssPick ? 'true' : 'false'); });
    });
    $('btn-ss-start').onclick = function () {
      if (!ssPick) { $('ss-warn').textContent = 'Pick a team.'; return; }
      startSeason(ssPick, 1);
    };
    $('btn-hub-back').onclick = function () { s = null; renderStart(); };
    $('hub-tabs').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-htab]'); if (!b) return;
      hubTab = b.getAttribute('data-htab'); renderHubTab();
    });
    $('hub-body').addEventListener('click', function (ev) {
      var w = ev.target.closest('[data-wk]');
      if (w && !w.disabled) { scoresWeek = +w.getAttribute('data-wk'); renderHubTab(); return; }
      toggleDetail(ev);
    });
    $('week-body').addEventListener('click', toggleDetail);
    $('hub-next').addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      if (b.id === 'btn-play') playSeasonGame();
      else if (b.id === 'btn-sim-mine' || b.id === 'btn-sim-week') finishRound();
      else if (b.id === 'btn-sim-end') {
        if (!simEndArmed) { simEndArmed = true; b.textContent = 'Tap again to sim every remaining regular-season game'; b.classList.add('armed'); return; }
        simToEnd();
      }
      else if (b.id === 'btn-next-season') startSeason(season.team, season.year + 1);
      else if (b.id === 'btn-new-season') { ssPick = null; renderSeasonSetup(); }
    });
    $('btn-week-go').onclick = continueRound;
    $('btn-box-season').onclick = function () {
      show('ov-box', false);
      s = null;
      renderHub();
      if (season && season.phase !== 'done') finishRound();
    };
  }
  function toggleDetail(ev) {
    var row = ev.target.closest('.gline'); if (!row) return;
    var d = row.parentNode.querySelector('.gdetail'); if (d) d.hidden = !d.hidden;
  }

  // Test hook: read-only access to the current state.
  window.CFL.ui = { state: function () { return s; }, busy: function () { return busy; }, season: function () { return season; } };

  storedArt = loadJSON(KEY_ART) || {};
  T.setCustomArt(effectiveArt());
  bind();
  bindArt();
  bindSeason();
  renderStart();
})();
