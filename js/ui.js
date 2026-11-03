/* CFL Armchair Football — user interface. */
(function () {
  'use strict';
  var E = CFL.Engine, AI = CFL.AI, T = CFL.Teams;
  var KEY_CUR = 'cflArmchair.current', KEY_HIST = 'cflArmchair.history', KEY_PREF = 'cflArmchair.prefs', KEY_ART = 'cflArmchair.helmetArt';
  var FAST = /[?&]fast=1/.test(location.search);
  var DICE_MS = FAST ? 0 : 600;

  var s = null;          // current game state
  var busy = false;      // animating a play
  var cpuTimer = null;
  var prefs = loadJSON(KEY_PREF) || { mute: false, speed: 'normal' };
  var setupSel = { t1: null, t2: null };

  function $(id) { return document.getElementById(id); }
  function show(id, on) { $(id).hidden = !on; }
  function esc(x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------- storage (never fatal) ---------- */
  function loadJSON(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  function removeKey(k) { try { localStorage.removeItem(k); } catch (e) { } }
  function saveGame() { if (s && s.phase !== 'final') saveJSON(KEY_CUR, s); }
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
    ['start', 'setup', 'game'].forEach(function (n) { show('screen-' + n, n === name); });
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
        ' <small>' + (g.mode === 'pnp' ? 'P&amp;P' : 'Solo') + '</small></span><span class="hdate">' +
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
      h.push({ id: s.id, date: new Date().toISOString(), home: s.teams[0], away: s.teams[1], score: s.score.slice(), ot: !!s.ot, mode: s.mode });
      saveJSON(KEY_HIST, h.slice(-100));
      removeKey(KEY_CUR);
      soundWhistle();
    }
    setTimeout(showBox, FAST ? 0 : 900);
  }
  function showBox() {
    var w = s.winner;
    $('box-title').textContent = 'Final' + (s.ot ? ' (OT)' : '') + ': ' + team(0).id + ' ' + s.score[0] + ', ' + team(1).id + ' ' + s.score[1];
    $('box-body').innerHTML = '<div class="box-line">' + T.helmetSVG(team(w === null ? 0 : w).id, 64) +
      '<div><b>' + (w === null ? 'Tie game' : team(w).city + ' ' + team(w).name + ' win!') + '</b></div></div>' + statsHTML();
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
    $('btn-quit').onclick = function () { clearTimeout(cpuTimer); saveGame(); show('ov-menu', false); s = null; renderStart(); };
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

  // Test hook: read-only access to the current state.
  window.CFL.ui = { state: function () { return s; }, busy: function () { return busy; } };

  storedArt = loadJSON(KEY_ART) || {};
  T.setCustomArt(effectiveArt());
  bind();
  bindArt();
  renderStart();
})();
