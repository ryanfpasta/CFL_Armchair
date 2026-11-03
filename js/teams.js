/* CFL Armchair Football — team data.
   Colours, plus a generic helmet with an original emblem drawn in code. No official logo artwork. */
(function (root) {
  'use strict';
  var TEAMS = [
    { id: 'BC',  city: 'BC',           name: 'Lions',       primary: '#F47920', secondary: '#000000' },
    { id: 'CGY', city: 'Calgary',      name: 'Stampeders',  primary: '#C8102E', secondary: '#FFFFFF' },
    { id: 'EDM', city: 'Edmonton',     name: 'Elks',        primary: '#00573F', secondary: '#FFC72C' },
    { id: 'SSK', city: 'Saskatchewan', name: 'Roughriders', primary: '#006341', secondary: '#FFFFFF' },
    { id: 'WPG', city: 'Winnipeg',     name: 'Blue Bombers',primary: '#003087', secondary: '#FFC72C' },
    { id: 'HAM', city: 'Hamilton',     name: 'Tiger-Cats',  primary: '#000000', secondary: '#FDB913' },
    { id: 'MTL', city: 'Montreal',     name: 'Alouettes',   primary: '#004B8D', secondary: '#E31837' },
    { id: 'OTT', city: 'Ottawa',       name: 'Redblacks',   primary: '#C8102E', secondary: '#000000' },
    { id: 'TOR', city: 'Toronto',      name: 'Argonauts',   primary: '#00205B', secondary: '#7AB3E8' }
  ];
  var byId = {};
  TEAMS.forEach(function (t) { byId[t.id] = t; });

  /* Original helmet emblems, one simple motif per nickname, drawn in a 20x20 box centred on 0,0.
     These are new designs for this app and are not copies of any CFL or team trademark. */
  function star(n, ro, ri) {
    var pts = [];
    for (var i = 0; i < n * 2; i++) {
      var a = Math.PI * i / n - Math.PI / 2, r = i % 2 ? ri : ro;
      pts.push((r * Math.cos(a)).toFixed(2) + ',' + (r * Math.sin(a)).toFixed(2));
    }
    return pts.join(' ');
  }
  var EMBLEMS = {
    // Lion face with a spiky mane
    BC: function (p, q) {
      return '<polygon points="' + star(12, 10.5, 7) + '" fill="' + q + '"/>' +
        '<circle cx="-4.6" cy="-4.6" r="2" fill="' + p + '" stroke="' + q + '" stroke-width=".7"/><circle cx="4.6" cy="-4.6" r="2" fill="' + p + '" stroke="' + q + '" stroke-width=".7"/>' +
        '<circle r="6.4" fill="' + p + '" stroke="' + q + '" stroke-width=".8"/>' +
        '<ellipse cy="2.6" rx="3.4" ry="2.6" fill="#fff" opacity=".55"/>' +
        '<circle cx="-2.3" cy="-1.4" r="1" fill="' + q + '"/><circle cx="2.3" cy="-1.4" r="1" fill="' + q + '"/>' +
        '<path d="M-1.6 1.4 L1.6 1.4 L0 3.2 Z" fill="' + q + '"/><path d="M-2.4 4.2 Q0 5.6 2.4 4.2" fill="none" stroke="' + q + '" stroke-width=".7"/>';
    },
    // Horse head in profile
    CGY: function (p, q) {
      return '<path d="M-6 10 L-4.5 2 C-6 -2 -4 -7 0 -9 L1 -11.5 L2.6 -8.6 C6 -8 9.5 -3 10 1 C10.2 2.6 8.6 3.6 7.2 2.6 L4 0.6 L2 3.4 L2.4 10 Z" fill="' + q + '" stroke="#111" stroke-width=".6"/>' +
        '<circle cx="3.4" cy="-4.4" r="1" fill="' + p + '"/>' +
        '<path d="M-1 -8 C-4 -6 -5.5 -2 -4.8 2" fill="none" stroke="' + p + '" stroke-width="1.2"/>';
    },
    // Elk antlers
    EDM: function (p, q) {
      return '<g fill="none" stroke="' + q + '" stroke-width="2" stroke-linecap="round">' +
        '<path d="M-1.6 6 C-3 1 -5 -3 -8.5 -9 M-4.6 -1.8 L-9.6 -2.6 M-6.4 -5.2 L-4.4 -10.4 M-3.2 1.6 L-7 3"/>' +
        '<path d="M1.6 6 C3 1 5 -3 8.5 -9 M4.6 -1.8 L9.6 -2.6 M6.4 -5.2 L4.4 -10.4 M3.2 1.6 L7 3"/></g>' +
        '<ellipse cy="7.4" rx="3.2" ry="2.8" fill="' + q + '"/>';
    },
    // Wheat stalk
    SSK: function (p, q) {
      var g = '<path d="M0 10.5 L0 -10" stroke="' + q + '" stroke-width="1.3" stroke-linecap="round"/>';
      for (var i = 0; i < 4; i++) {
        var y = -7 + i * 3.6;
        g += '<ellipse cx="-2.4" cy="' + y + '" rx="1.5" ry="2.8" transform="rotate(-30 -2.4 ' + y + ')" fill="' + q + '"/>' +
             '<ellipse cx="2.4" cy="' + y + '" rx="1.5" ry="2.8" transform="rotate(30 2.4 ' + y + ')" fill="' + q + '"/>';
      }
      return g + '<ellipse cy="-9.6" rx="1.4" ry="2.4" fill="' + q + '"/>';
    },
    // Bomber aircraft, top view
    WPG: function (p, q) {
      return '<path d="M0 -10.5 C1.4 -9 1.6 -6 1.6 -3.5 L10.5 1 L10.5 3.4 L1.6 1.8 L1.2 7 L4.6 9 L4.6 10.6 L0 9.6 L-4.6 10.6 L-4.6 9 L-1.2 7 L-1.6 1.8 L-10.5 3.4 L-10.5 1 L-1.6 -3.5 C-1.6 -6 -1.4 -9 0 -10.5 Z" fill="' + q + '" stroke="#111" stroke-width=".5"/>' +
        '<circle cx="-5.6" cy="1.2" r=".9" fill="' + p + '"/><circle cx="5.6" cy="1.2" r=".9" fill="' + p + '"/>';
    },
    // Tiger stripes / claw marks
    HAM: function (p, q) {
      return '<g fill="' + q + '">' +
        '<path d="M-9 -9 C-4 -4 -4.5 3 -7.5 10 C-6.5 3 -7 -3 -9 -9 Z"/>' +
        '<path d="M-2 -10.5 C3 -4 2.6 4 -0.6 10.5 C0.6 3 0 -4 -2 -10.5 Z"/>' +
        '<path d="M5 -9.5 C10 -4 9.6 3 6.6 9.5 C7.4 3 7 -3 5 -9.5 Z"/></g>';
    },
    // Lark in flight
    MTL: function (p, q) {
      return '<path d="M-10.5 -1.5 C-7 -7.5 -2.4 -6.4 0 -0.6 C2.4 -6.4 7 -7.5 10.5 -1.5 C6.6 -4 3 -2.6 0.8 4 L0 8.5 L-0.8 4 C-3 -2.6 -6.6 -4 -10.5 -1.5 Z" fill="#fff" stroke="' + q + '" stroke-width="1"/>' +
        '<path d="M-1.8 6.4 L0 10.5 L1.8 6.4" fill="' + q + '"/>';
    },
    // Split shield
    OTT: function (p, q) {
      return '<path d="M-8 -9.5 L0 -9.5 L0 10.5 C-3.4 9.4 -8 6.6 -8 0 Z" fill="' + p + '"/>' +
        '<path d="M0 -9.5 L8 -9.5 L8 0 C8 6.6 3.4 9.4 0 10.5 Z" fill="' + q + '"/>' +
        '<path d="M-8 -9.5 L8 -9.5 L8 0 C8 6.6 3.4 9.4 0 10.5 C-3.4 9.4 -8 6.6 -8 0 Z" fill="none" stroke="#fff" stroke-width="1.2"/>';
    },
    // Sailing ship
    TOR: function (p, q) {
      return '<path d="M-10.5 3.6 L10.5 3.6 L7.4 9 L-7.4 9 Z" fill="' + q + '"/>' +
        '<path d="M0 -10.5 L0 3.6" stroke="#fff" stroke-width="1"/>' +
        '<path d="M0.8 -9.6 L0.8 2.4 L9 2.4 Z" fill="#fff"/><path d="M-0.8 -6.4 L-0.8 2.4 L-7 2.4 Z" fill="' + q + '"/>' +
        '<path d="M-6 6.3 L6 6.3" stroke="' + p + '" stroke-width=".8"/>';
    }
  };
  function emblemSVG(id, size) {
    var t = byId[id];
    return '<svg class="emblem" width="' + size + '" height="' + size + '" viewBox="-12 -12 24 24" aria-hidden="true">' +
      '<circle r="12" fill="' + t.primary + '" stroke="' + t.secondary + '" stroke-width="1"/>' + EMBLEMS[id](t.primary, t.secondary) + '</svg>';
  }

  /* ---------- colour helpers ---------- */
  function shade(hex, amt) { // amt -1..1: negative darkens, positive lightens
    var n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255];
    c = c.map(function (v) { return Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt); });
    return '#' + c.map(function (v) { return ('0' + Math.max(0, Math.min(255, v)).toString(16)).slice(-2); }).join('');
  }

  /* ---------- custom helmet art supplied by the player ----------
     custom[id] = { src: dataURL, mode: 'decal' | 'full' } */
  var custom = {};
  function setCustomArt(map) { custom = map || {}; }
  function getCustomArt() { return custom; }

  /* ---------- helmet ----------
     Side-view helmet facing right, in a 100x80 box: shaded shell, crown stripe,
     ear hole, jaw pad, face mask and chin strap, with the emblem (or the player's decal) on the side. */
  /* Team badge for flat surfaces such as the end zones: the player's logo if one is set, else the drawn emblem.
     Centred on cx,cy and fitted in a size x size box (SVG user units). */
  function badgeSVG(id, cx, cy, size) {
    var t = byId[id], c = custom[id];
    if (c && c.src) {
      return '<circle cx="' + cx + '" cy="' + cy + '" r="' + (size / 2 + 0.8) + '" fill="#fff" opacity=".92"/>' +
        '<image href="' + c.src + '" x="' + (cx - size / 2 + 0.6) + '" y="' + (cy - size / 2 + 0.6) + '" width="' + (size - 1.2) + '" height="' + (size - 1.2) + '" preserveAspectRatio="xMidYMid meet"/>';
    }
    return '<g transform="translate(' + cx + ' ' + cy + ') scale(' + (size / 24) + ')">' + EMBLEMS[id](t.primary, t.secondary) + '</g>';
  }

  var uid = 0;
  var SHELL = 'M18 60 C9 40 17 13 46 7 C71 2 91 18 91 40 L89 48 L73 50 C69 52 67 57 67 63 L65 70 L35 72 C26 72 20 67 18 60 Z';
  function helmetSVG(id, size, flip) {
    var t = byId[id], c = custom[id];
    size = size || 40;
    var w = size, h = Math.round(size * 0.8);
    var label = ' role="img" aria-label="' + t.city + ' ' + t.name + ' helmet"';
    if (c && c.src && c.mode === 'full') {
      return '<svg class="helmet" width="' + w + '" height="' + h + '" viewBox="0 0 100 80"' + label + '>' +
        '<image href="' + c.src + '" x="0" y="0" width="100" height="80" preserveAspectRatio="xMidYMid meet"' +
        (flip ? ' transform="translate(100,0) scale(-1,1)"' : '') + '/></svg>';
    }
    var k = 'h' + (++uid), p = t.primary, q = t.secondary;
    var dark = p === '#000000';
    var lite = dark ? '#3a3a3a' : shade(p, 0.32), deep = dark ? '#000000' : shade(p, -0.45);
    var tr = flip ? ' transform="translate(100,0) scale(-1,1)"' : '';
    var ex = flip ? 100 - 45 : 45; // emblem drawn un-mirrored so text in a decal stays readable
    var out = '<svg class="helmet" width="' + w + '" height="' + h + '" viewBox="0 0 100 80"' + label + '>' +
      '<defs>' +
      '<radialGradient id="' + k + 'g" cx="' + (flip ? '62%' : '38%') + '" cy="28%" r="78%">' +
        '<stop offset="0" stop-color="' + lite + '"/><stop offset=".55" stop-color="' + p + '"/><stop offset="1" stop-color="' + deep + '"/></radialGradient>' +
      '<clipPath id="' + k + 'c"><path d="' + SHELL + '"/></clipPath>' +
      '<linearGradient id="' + k + 'm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1f3f5"/><stop offset="1" stop-color="#9aa3ad"/></linearGradient>' +
      '</defs><g' + tr + '>' +
      // drop shadow
      '<ellipse cx="52" cy="74" rx="34" ry="3.2" fill="#000" opacity=".28"/>' +
      // shell
      '<path d="' + SHELL + '" fill="url(#' + k + 'g)"/>' +
      '<g clip-path="url(#' + k + 'c)">' +
        // crown stripe: dark edges with the secondary colour inside
        '<path d="M91 38 C87 19 70 11 48 12 C30 13 19 26 18 52" fill="none" stroke="' + (q === '#000000' || dark ? '#f5f5f5' : '#111') + '" stroke-width="11" opacity=".9"/>' +
        '<path d="M91 38 C87 19 70 11 48 12 C30 13 19 26 18 52" fill="none" stroke="' + q + '" stroke-width="7"/>' +
        // rim shadow and gloss
        '<path d="' + SHELL + '" fill="none" stroke="#000" stroke-width="7" opacity=".22"/>' +
        '<ellipse cx="40" cy="20" rx="20" ry="7" transform="rotate(-18 40 20)" fill="#fff" opacity=".22"/>' +
      '</g>' +
      // bottom edge trim, ear hole, jaw pad
      '<path d="M65 70 L35 72 C26 72 20 67 18 60" fill="none" stroke="' + deep + '" stroke-width="3"/>' +
      '<ellipse cx="61" cy="56" rx="3" ry="3.6" fill="#111" opacity=".75"/><ellipse cx="61" cy="56" rx="1.4" ry="1.8" fill="#000"/>' +
      '<path d="M67 58 C72 58 76 62 75 70 L66 71 Z" fill="#1b1b1b"/>' +
      '<path d="' + SHELL + '" fill="none" stroke="#0a0a0a" stroke-width="2"/>' +
      // face mask
      '<g fill="none" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M72 50 C82 49 92 50 98 53 M69 60 L98 60 M67 68 C77 73 91 71 98 66 M98 53 L98 66 M85 50 L85 71" stroke="#2b2f33" stroke-width="4.8"/>' +
        '<path d="M72 50 C82 49 92 50 98 53 M69 60 L98 60 M67 68 C77 73 91 71 98 66 M98 53 L98 66 M85 50 L85 71" stroke="url(#' + k + 'm)" stroke-width="3"/>' +
      '</g>' +
      // chin strap
      '<path d="M60 70 C66 76 78 77 86 73" fill="none" stroke="#f4f4f4" stroke-width="2.2"/><circle cx="60" cy="69.6" r="1.6" fill="#ddd" stroke="#555" stroke-width=".5"/>' +
      '</g>';
    if (c && c.src) {
      out += '<image href="' + c.src + '" x="' + (ex - 17) + '" y="19" width="34" height="34" preserveAspectRatio="xMidYMid meet"/>';
    } else {
      out += '<g transform="translate(' + ex + ' 37) scale(' + (flip ? -1.45 : 1.45) + ' 1.45)">' +
        '<g transform="translate(.5 .7)" opacity=".35">' + EMBLEMS[id]('#000', '#000') + '</g>' +
        EMBLEMS[id](p, q) + '</g>';
    }
    return out + '</svg>';
  }

  var api = { TEAMS: TEAMS, byId: byId, helmetSVG: helmetSVG, emblemSVG: emblemSVG, badgeSVG: badgeSVG, setCustomArt: setCustomArt, getCustomArt: getCustomArt };
  root.CFL = root.CFL || {};
  root.CFL.Teams = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
