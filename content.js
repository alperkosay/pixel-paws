// Miyav! — sayfadaki kediler.
(() => {
  'use strict';
  if (window.top !== window || window.__miyavKediler) return;
  window.__miyavKediler = true;

  const SP = globalThis.MiyavSprites;
  if (!SP || !globalThis.chrome || !chrome.storage) return;

  const BOX = 24;                 // kedi tuvali (sprite pikseli)
  const HUNGER_PER_MIN = 0.55;    // dakikada azalan tokluk
  const THIRST_PER_MIN = 0.45;    // dakikada azalan su
  const MAX_TOYS = 8;
  // Sevilebilen, sakin durumlar
  const CALM = ['sit', 'lick', 'sleep', 'beg', 'petted', 'wander', 'land'];
  // Üzerine tıklanabilen / sağ tıklanabilen durumlar
  const INTERACTIVE = CALM.concat(['eat', 'scratchScreen', 'stareBowl', 'loudMeow', 'scratchPost']);
  // Kedi ağacının rafındayken rafta kalınan durumlar
  const PERCH_SNAP = ['sit', 'lick', 'sleep', 'petted', 'beg', 'loudMeow'];

  const rand = (a, b) => a + Math.random() * (b - a);
  const chance = (p) => Math.random() < p;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const now = () => performance.now();

  // ---------- Durum ----------
  const DEFAULT_SETTINGS = { enabled: true, scale: 3, disabledSites: [], tree: true };
  let settings = Object.assign({}, DEFAULT_SETTINGS);
  let catDefs = [];
  const stats = {};
  const supply = { food: 0, water: 0 };
  const supplyUser = { food: null, water: null };
  let lastAmbush = -1e9;
  let S = 3;          // ölçek
  let K = 1;          // hız çarpanı

  const mouse = { x: -999, y: -999, last: 0, speed: 0, seen: false, inside: false };
  addEventListener('mousemove', (e) => {
    const t = now();
    const d = Math.hypot(e.clientX - mouse.x, e.clientY - mouse.y);
    const dt = Math.max(8, t - mouse.last);
    mouse.speed = mouse.speed * 0.6 + Math.min(4000, (d / dt) * 1000) * 0.4;
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.last = t;
    mouse.seen = true; mouse.inside = true;
  }, { passive: true, capture: true });
  document.addEventListener('mouseout', (e) => { if (!e.relatedTarget) mouse.inside = false; }, { passive: true });

  const W = () => document.documentElement.clientWidth || innerWidth;
  const H = () => innerHeight;
  const ground = () => H() - 3;

  // ---------- İstatistikler ----------
  function stat(id) {
    const s = stats[id] || (stats[id] = { love: 0, fullness: 80, fullnessAt: Date.now() });
    if (s.water == null) { s.water = 80; s.waterAt = Date.now(); }
    return s;
  }
  function fullnessOf(id) {
    const s = stat(id);
    return clamp(s.fullness - ((Date.now() - s.fullnessAt) / 60000) * HUNGER_PER_MIN, 0, 100);
  }
  function waterOf(id) {
    const s = stat(id);
    return clamp(s.water - ((Date.now() - s.waterAt) / 60000) * THIRST_PER_MIN, 0, 100);
  }
  const saveTimers = {};
  function saveStat(id, soon) {
    clearTimeout(saveTimers[id]);
    const write = () => chrome.storage.local.set({ ['stat_' + id]: stat(id) }).catch(() => {});
    if (soon) saveTimers[id] = setTimeout(write, 1200);
    else write();
  }
  function nourish(id, kind, amount) {
    const s = stat(id);
    if (kind === 'water') { s.water = clamp(waterOf(id) + amount, 0, 100); s.waterAt = Date.now(); }
    else { s.fullness = clamp(fullnessOf(id) + amount, 0, 100); s.fullnessAt = Date.now(); }
    saveStat(id);
  }
  function addLove(id, amount) {
    stat(id).love = Math.round((stat(id).love + amount) * 10) / 10;
    saveStat(id, true);
  }
  function setSupply(kind, n) {
    supply[kind] = clamp(n, 0, 3);
    drawSupply();
    chrome.storage.local.set({ [kind === 'water' ? 'water' : 'bowl']: supply[kind] }).catch(() => {});
  }

  // ---------- DOM ----------
  let host = null, layer = null, raf = 0;
  const L = {};      // katmanlar: back, dock, toys, cats, fx, ui
  const D = {};      // dock elemanları ve konumları
  let treeEl = null;
  const tree = { left: 0, top: 0, on: false };
  const perchOwner = [null, null, null];

  const CSS = `
    :host { all: initial; }
    .layer, .sub { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
    .cat, .toy { position: absolute; left: 0; top: 0; image-rendering: pixelated; pointer-events: none;
           will-change: transform; touch-action: none; user-select: none; -webkit-user-select: none; }
    .cat.int, .toy { pointer-events: auto; cursor: grab; }
    .cat.held, .toy.held { pointer-events: auto; cursor: grabbing; }
    .fx, .mark, .tree { position: absolute; left: 0; top: 0; pointer-events: none; image-rendering: pixelated; }
    .bubble { position: absolute; pointer-events: none; transform: translate(-50%, -100%);
      font: 700 12px/1.15 "Trebuchet MS", "Segoe UI", system-ui, sans-serif; color: #3a2630;
      background: #fffaf3; border: 2px solid #3a2630; border-radius: 9px; padding: 3px 8px;
      white-space: nowrap; box-shadow: 2px 2px 0 rgba(58,38,48,.22); display: flex; align-items: center; gap: 4px; }
    .bubble::after { content: ""; position: absolute; left: 50%; bottom: -6px; width: 6px; height: 6px;
      background: #fffaf3; border-right: 2px solid #3a2630; border-bottom: 2px solid #3a2630;
      transform: translateX(-50%) rotate(45deg); }
    .bubble.name { background: #3a2630; color: #fffaf3; }
    .bubble.name::after { background: #3a2630; }
    .bubble.loud { font-size: 16px; color: #d33a5e; padding: 4px 10px; }
    .txt { position: absolute; left: 0; top: 0; pointer-events: none;
      font: 800 14px/1 "Trebuchet MS", "Segoe UI", system-ui, sans-serif; color: #6c5a8f;
      text-shadow: 1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff; }
    .dot { position: absolute; left: 0; top: 0; pointer-events: none; }
    .dock canvas { position: absolute; bottom: 2px; pointer-events: auto; cursor: pointer; image-rendering: pixelated;
      transition: transform .15s; transform-origin: 50% 100%; }
    .dock canvas:hover { transform: translateY(-2px) rotate(-4deg); }
    .dock canvas:active { transform: translateY(1px) scale(.95); }

    .menu { position: absolute; left: 0; top: 0; min-width: 196px; pointer-events: auto;
      background: #fffaf3; border: 2px solid #3a2630; border-radius: 11px; padding: 6px;
      box-shadow: 3px 3px 0 rgba(58,38,48,.25); color: #3a2630;
      font: 600 13px/1.2 "Trebuchet MS", "Segoe UI", system-ui, sans-serif; }
    .menu .hd { display: flex; gap: 8px; align-items: center; padding: 2px 4px 7px;
      border-bottom: 2px dashed #ecdcca; margin-bottom: 4px; }
    .menu .hd canvas { image-rendering: pixelated; flex: none; }
    .menu .nm { font-weight: 800; font-size: 14px; }
    .menu .sm { font-size: 11px; color: #9a8478; }
    .menu .bars { display: grid; grid-template-columns: 14px 1fr; gap: 3px 4px; align-items: center;
      font-size: 10px; margin-top: 3px; }
    .menu .bar { height: 7px; border: 2px solid #3a2630; border-radius: 4px; background: #f3e6d6; overflow: hidden; }
    .menu .bar i { display: block; height: 100%; }
    .menu button { all: unset; box-sizing: border-box; display: flex; gap: 8px; align-items: center; width: 100%;
      padding: 6px 8px; border-radius: 7px; cursor: pointer; }
    .menu button:hover { background: #ffe8d6; }
    .menu button[disabled] { opacity: .4; cursor: default; background: none; }
    .menu button .ic { width: 18px; text-align: center; }
    .menu .sep { height: 2px; background: #ecdcca; margin: 4px 2px; border-radius: 2px; }
    .menu .title { font-weight: 800; font-size: 12px; padding: 2px 6px 4px; text-transform: uppercase; letter-spacing: .6px; }
    .menu .toys { display: flex; gap: 4px; }
    .menu .toys button { flex-direction: column; gap: 4px; padding: 6px 4px; font-size: 11px; justify-content: center; }
    .menu .toys canvas { image-rendering: pixelated; }
  `;

  function sub(name) {
    const d = document.createElement('div');
    d.className = 'sub ' + name;
    layer.appendChild(d);
    return (L[name] = d);
  }

  function ensureHost() {
    if (host) return;
    host = document.createElement('miyav-kediler');
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483646;pointer-events:none;display:block;';
    const root = host.attachShadow({ mode: 'open' });
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      root.adoptedStyleSheets = [sheet];
    } catch (_) {
      const st = document.createElement('style');
      st.textContent = CSS;
      root.appendChild(st);
    }
    layer = document.createElement('div');
    layer.className = 'layer';
    root.appendChild(layer);
    ['back', 'dock', 'toys', 'cats', 'fx', 'ui'].forEach(sub);

    const mk = (key, title, onClick) => {
      const c = document.createElement('canvas');
      c.title = title;
      c.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
      c.addEventListener('pointerdown', (e) => e.stopPropagation());
      c.addEventListener('contextmenu', (e) => e.preventDefault());
      L.dock.appendChild(c);
      D[key] = c;
    };
    mk('bag', 'Mama çuvalı — tıkla, mama kabını doldur!', () => pour('food'));
    mk('food', 'Mama kabı', () => pour('food'));
    mk('jug', 'Su sürahisi — tıkla, su kabını doldur!', () => pour('water'));
    mk('water', 'Su kabı', () => pour('water'));
    mk('basket', 'Oyuncak sepeti', () => openToyTray());

    treeEl = document.createElement('canvas');
    treeEl.className = 'tree';
    L.back.appendChild(treeEl);

    layoutAll();
    document.documentElement.appendChild(host);
  }

  function paintSprite(cv, name, frame, scale) {
    const img = SP.imageData(name, frame, 'tarcin', {});
    cv.width = img.width; cv.height = img.height;
    cv.getContext('2d').putImageData(img, 0, 0);
    cv.style.width = img.width * scale + 'px';
    cv.style.height = img.height * scale + 'px';
  }

  function layoutAll() {
    if (!host) return;
    const s2 = Math.max(2, S - 1);
    paintSprite(D.bag, 'bag', 0, s2);
    paintSprite(D.jug, 'jug', 0, s2);
    paintSprite(D.basket, 'basket', 0, s2);
    drawSupply();
    let x = 10;
    const place = (el, w, gap) => { el.style.left = x + 'px'; const c = x + w / 2; x += w + gap; return c; };
    place(D.bag, 12 * s2, 4);
    D.foodX = place(D.food, 16 * S, 13 * S);
    place(D.jug, 10 * s2, 4);
    D.waterX = place(D.water, 16 * S, 13 * S);
    D.basketX = place(D.basket, 15 * s2, 0);
    D.end = x;
    paintSprite(treeEl, 'tree', 0, S);
    layoutTree();
  }

  function layoutTree() {
    if (!treeEl) return;
    tree.on = settings.tree !== false;
    treeEl.style.display = tree.on ? '' : 'none';
    tree.left = Math.round(W() - 36 * S - 10);
    tree.top = Math.round(H() - 60 * S);
    treeEl.style.transform = `translate(${tree.left}px,${tree.top}px)`;
  }

  function perchPos(i) {
    const p = SP.TREE_PERCHES[i];
    return { x: tree.left + p.x * S, y: tree.top + (p.top + 1) * S };
  }
  function freePerches() {
    if (!tree.on) return [];
    return perchOwner.map((o, i) => (o ? -1 : i)).filter((i) => i >= 0);
  }
  function releasePerch(c) {
    if (c.perch != null && perchOwner[c.perch] === c.id) perchOwner[c.perch] = null;
    c.perch = null;
  }

  function drawSupply() {
    if (!D.food) return;
    paintSprite(D.food, 'bowl', supply.food, S);
    paintSprite(D.water, 'water', supply.water, S);
  }
  const bowlX = (kind) => (kind === 'water' ? D.waterX : D.foodX) || 60;

  function pour(kind) {
    if (!D.food) return;
    const from = (kind === 'water' ? D.jug : D.bag).getBoundingClientRect();
    const to = (kind === 'water' ? D.water : D.food).getBoundingClientRect();
    const colors = kind === 'water' ? ['#a5e3ff', '#5cbcec', '#ffffff'] : ['#d6964f', '#8f5a2b', '#c47c3a'];
    for (let i = 0; i < 12; i++) {
      const d = document.createElement('div');
      d.className = 'dot';
      const sz = Math.max(3, S);
      d.style.cssText = `width:${sz}px;height:${sz}px;background:${pick(colors)}`;
      const x0 = from.left + from.width * 0.6, y0 = from.top + 4;
      const x1 = to.left + rand(0.25, 0.75) * to.width, y1 = to.top + to.height * 0.35;
      L.fx.appendChild(d);
      d.animate([
        { transform: `translate(${x0}px,${y0}px)` },
        { transform: `translate(${(x0 + x1) / 2}px,${y0 - 30 - rand(0, 20)}px)`, offset: 0.45 },
        { transform: `translate(${x1}px,${y1}px)` },
      ], { duration: 520, delay: i * 35, easing: 'ease-in', fill: 'backwards' }).onfinish = () => d.remove();
    }
    bubble(kind === 'water' ? 'taze su!' : 'mama zamanı!', from.left + from.width / 2, from.top - 4, 1300);
    setTimeout(() => { setSupply(kind, 3); callCats(kind); }, 600);
  }

  function callCats(kind) {
    for (const c of cats.values()) {
      const need = kind === 'water' ? waterOf(c.id) : fullnessOf(c.id);
      if (need < 75) c.want = { kind, t: rand(0.3, 2) };
    }
  }

  function jiggle(el) {
    if (el) el.animate([{ rotate: '0deg' }, { rotate: '-8deg' }, { rotate: '7deg' }, { rotate: '0deg' }], { duration: 320 });
  }

  // ---------- Efektler ----------
  function fxSprite(name, x, y, o = {}) {
    if (!L.fx) return;
    const sc = o.scale || Math.max(2, S - 1);
    const c = SP.canvas(name, 0, 'tarcin', {}, sc);
    c.className = 'fx';
    const w = parseFloat(c.style.width), h = parseFloat(c.style.height);
    const x0 = x - w / 2, y0 = y - h / 2;
    const dx = o.dx || 0, dy = o.dy == null ? -45 : o.dy;
    L.fx.appendChild(c);
    c.animate([
      { transform: `translate(${x0}px,${y0}px) scale(.4)`, opacity: 0 },
      { transform: `translate(${x0 + dx * 0.15}px,${y0 + dy * 0.15}px) scale(1.1)`, opacity: 1, offset: 0.18 },
      { transform: `translate(${x0 + dx}px,${y0 + dy}px) scale(1)`, opacity: 0 },
    ], { duration: o.dur || 1100, easing: 'ease-out' }).onfinish = () => c.remove();
  }

  function fxText(text, x, y, o = {}) {
    if (!L.fx) return;
    const s = document.createElement('div');
    s.className = 'txt';
    s.textContent = text;
    if (o.size) s.style.fontSize = o.size + 'px';
    if (o.color) s.style.color = o.color;
    L.fx.appendChild(s);
    const dx = o.dx || 0, dy = o.dy == null ? -30 : o.dy;
    s.animate([
      { transform: `translate(${x}px,${y}px) scale(.6)`, opacity: 0 },
      { transform: `translate(${x + dx * 0.2}px,${y + dy * 0.2}px) scale(1)`, opacity: 1, offset: 0.2 },
      { transform: `translate(${x + dx}px,${y + dy}px) scale(1.15)`, opacity: 0 },
    ], { duration: o.dur || 1400, easing: 'ease-out' }).onfinish = () => s.remove();
  }

  function dust(x, y, n = 3, color = 'rgba(214,205,194,.9)') {
    if (!L.fx) return;
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div');
      d.className = 'dot';
      const sz = Math.round(S * rand(1.3, 2.3));
      d.style.cssText = `width:${sz}px;height:${sz}px;background:${color}`;
      L.fx.appendChild(d);
      const dx = rand(-14, 14), dy = rand(-14, -4);
      d.animate([
        { transform: `translate(${x}px,${y - sz}px) scale(1)`, opacity: 0.9 },
        { transform: `translate(${x + dx}px,${y + dy}px) scale(.3)`, opacity: 0 },
      ], { duration: rand(350, 550), easing: 'ease-out' }).onfinish = () => d.remove();
    }
  }

  // Ekranda tırmık izi (cam çiziliyormuş gibi)
  function clawMark(x, y) {
    if (!L.fx) return;
    const MW = 12, MH = 22;
    const c = document.createElement('canvas');
    c.width = MW; c.height = MH;
    const g = c.getContext('2d');
    for (let i = 0; i < 3; i++) {
      const len = MH - (i === 1 ? 0 : 4);
      const y0 = i === 1 ? 0 : 2;
      for (let yy = 0; yy < len; yy++) {
        const xx = i * 4 + Math.floor(yy / 8);
        g.fillStyle = 'rgba(80,50,55,.8)';
        g.fillRect(xx, y0 + yy, 2, 1);
        g.fillStyle = 'rgba(255,255,255,.9)';
        g.fillRect(xx + 2, y0 + yy, 1, 1);
      }
    }
    c.className = 'mark';
    const sc = Math.max(2, S - 1);
    c.style.width = MW * sc + 'px';
    c.style.height = MH * sc + 'px';
    c.style.transform = `translate(${Math.round(x - (MW / 2) * sc)}px,${Math.round(y)}px)`;
    // İzler camın üstünde: kedinin önünde görünsün
    L.fx.appendChild(c);
    c.animate([{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 160, easing: 'ease-out' });
    c.animate([{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 8000 }).onfinish = () => c.remove();
  }

  function bubble(text, x, y, ms = 1400, o = {}) {
    if (!L.fx) return null;
    const b = document.createElement('div');
    b.className = 'bubble' + (o.cls ? ' ' + o.cls : '');
    if (o.icon) b.appendChild(SP.canvas(o.icon, 0, 'tarcin', {}, 2));
    if (text) b.appendChild(document.createTextNode(text));
    b.style.left = Math.round(clamp(x, 50, W() - 50)) + 'px';
    b.style.top = Math.round(Math.max(30, y)) + 'px';
    L.fx.appendChild(b);
    b.animate([{ opacity: 0, marginTop: '6px' }, { opacity: 1, marginTop: '0px' }], { duration: 160, easing: 'ease-out' });
    setTimeout(() => {
      b.animate([{ opacity: 1 }, { opacity: 0, marginTop: '-6px' }], { duration: 220 }).onfinish = () => b.remove();
    }, ms);
    return b;
  }

  // ---------- Oyuncaklar ----------
  const TOY_DEF = {
    ball:  { bounce: 0.68, fric: 0.45, roll: true, label: 'Top' },
    yarn:  { bounce: 0.38, fric: 1.3, roll: true, label: 'Yumak' },
    mouse: { bounce: 0.15, fric: 1.9, roll: false, label: 'Fare' },
  };
  const toys = [];

  class Toy {
    constructor(kind, x, y, vx, vy) {
      this.kind = kind;
      this.def = TOY_DEF[kind];
      this.x = x; this.y = y; this.vx = vx; this.vy = vy;
      this.rot = 0; this.dir = vx < 0 ? -1 : 1;
      this.held = false; this.alive = true; this.lastActive = now();
      this.el = document.createElement('canvas');
      this.el.className = 'toy';
      this.size();
      L.toys.appendChild(this.el);
      this.bind();
    }
    size() {
      paintSprite(this.el, this.kind, 0, S);
      this.w = this.el.width * S; this.h = this.el.height * S;
    }
    get speed() { return Math.hypot(this.vx, this.vy); }
    kick(vx, vy) {
      this.vx = vx; this.vy = vy;
      this.lastActive = now();
      if (this.kind === 'mouse') this.vy = Math.max(vy * 0.35, -200);
    }
    remove(poof) {
      if (!this.alive) return;
      this.alive = false;
      if (poof) dust(this.x, this.y + this.h / 2, 5);
      this.el.remove();
      toys.splice(toys.indexOf(this), 1);
    }
    bind() {
      const el = this.el;
      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        closeMenu();
        this.press = { x: e.clientX, y: e.clientY, moved: false };
        this.hv = { x: 0, y: 0 };
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
      });
      el.addEventListener('pointermove', (e) => {
        if (!this.press) return;
        mouse.x = e.clientX; mouse.y = e.clientY;
        if (!this.press.moved && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > 4) {
          this.press.moved = true;
          this.held = true;
          el.classList.add('held');
        }
      });
      const up = (e) => {
        if (!this.press) return;
        const p = this.press;
        this.press = null;
        try { el.releasePointerCapture(e.pointerId); } catch (_) {}
        if (this.held) {
          this.held = false;
          el.classList.remove('held');
          this.kick(clamp(this.hv.x, -2200, 2200), clamp(this.hv.y, -2200, 1800));
          inviteCats(this);
        } else if (!p.moved) {
          // tıklayınca zıplasın
          this.kick(rand(-260, 260) * K, -rand(380, 560) * K);
          inviteCats(this);
        }
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); this.remove(true); });
      el.title = `${this.def.label} — sürükleyip fırlat, sağ tıkla kaldır`;
    }
    update(dt) {
      const floor = ground() - this.h / 2 + S;
      if (this.held) {
        const nx = this.x + (mouse.x - this.x) * Math.min(1, dt * 25);
        const ny = this.y + (mouse.y - this.y) * Math.min(1, dt * 25);
        if (dt > 0) {
          this.hv.x = this.hv.x * 0.6 + ((nx - this.x) / dt) * 0.4;
          this.hv.y = this.hv.y * 0.6 + ((ny - this.y) / dt) * 0.4;
        }
        this.x = nx; this.y = ny;
        this.vx = this.hv.x; this.vy = this.hv.y;
        if (Math.hypot(this.hv.x, this.hv.y) > 80) this.lastActive = now();
      } else {
        this.vy += 1900 * K * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        const minX = this.w / 2, maxX = W() - this.w / 2;
        if (this.x < minX) { this.x = minX; this.vx = Math.abs(this.vx) * 0.7; }
        if (this.x > maxX) { this.x = maxX; this.vx = -Math.abs(this.vx) * 0.7; }
        if (this.y < this.h / 2) { this.y = this.h / 2; this.vy = Math.abs(this.vy) * 0.5; }
        if (this.y >= floor) {
          this.y = floor;
          if (this.vy > 140) {
            this.vy = -this.vy * this.def.bounce;
            if (Math.abs(this.vy) > 250) dust(this.x, ground(), 1);
          } else this.vy = 0;
          this.vx *= 1 - Math.min(1, this.def.fric * dt);
          if (Math.abs(this.vx) < 4) this.vx = 0;
        }
        if (this.speed > 60) this.lastActive = now();
      }
      if (this.def.roll) this.rot += (this.vx * dt) / (this.h / 2);
      else if (Math.abs(this.vx) > 10) this.dir = Math.sign(this.vx);
      let tf = `translate3d(${Math.round(this.x - this.w / 2)}px,${Math.round(this.y - this.h / 2)}px,0)`;
      if (this.def.roll) tf += ` rotate(${(this.rot * 57.3).toFixed(1)}deg)`;
      else if (this.dir > 0) tf += ' scaleX(-1)';
      this.el.style.transform = tf;
    }
  }

  function spawnToy(kind, x, y, vx, vy) {
    if (!L.toys) return null;
    if (toys.length >= MAX_TOYS) toys[0].remove(true);
    const t = new Toy(kind, x, y, vx, vy);
    toys.push(t);
    inviteCats(t);
    return t;
  }

  function inviteCats(toy) {
    for (const c of cats.values()) {
      if (c.state === 'play' || !CALM.includes(c.state) || c.state === 'sleep') continue;
      const d = Math.abs(c.x - toy.x);
      if (d < 700 * K && chance(0.85)) c.wantPlay = { toy, t: rand(0.1, 0.8) };
    }
  }

  function nearestToy(c) {
    let best = null, bd = 1e9;
    for (const t of toys) { const d = Math.hypot(t.x - c.x, t.y - c.y); if (d < bd) { bd = d; best = t; } }
    return best;
  }

  // ---------- Menü (sağ tık) ve oyuncak tepsisi ----------
  let menuEl = null;
  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
  addEventListener('pointerdown', (e) => {
    if (menuEl && !e.composedPath().includes(menuEl)) closeMenu();
  }, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); }, true);
  addEventListener('wheel', () => closeMenu(), { passive: true });
  addEventListener('blur', () => closeMenu());

  function showMenu(el, x, y) {
    closeMenu();
    menuEl = el;
    el.className = 'menu';
    L.ui.appendChild(el);
    const w = el.offsetWidth, h = el.offsetHeight;
    const mx = clamp(x, 6, W() - w - 6), my = clamp(y, 6, H() - h - 6);
    el.style.transform = `translate(${mx}px,${my}px)`;
    el.animate([{ opacity: 0, scale: '.92' }, { opacity: 1, scale: '1' }], { duration: 120, easing: 'ease-out' });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  function menuButton(icon, label, onClick, disabled) {
    const b = document.createElement('button');
    const ic = document.createElement('span');
    ic.className = 'ic';
    ic.textContent = icon;
    b.append(ic, document.createTextNode(label));
    if (disabled) b.disabled = true;
    b.addEventListener('click', (e) => { e.stopPropagation(); closeMenu(); onClick(); });
    return b;
  }

  function toyButtons(spawnAt) {
    const row = document.createElement('div');
    row.className = 'toys';
    for (const kind of Object.keys(TOY_DEF)) {
      const b = document.createElement('button');
      b.append(SP.canvas(kind, 0, 'tarcin', {}, 3), document.createTextNode(TOY_DEF[kind].label));
      b.addEventListener('click', (e) => { e.stopPropagation(); closeMenu(); spawnAt(kind); });
      row.appendChild(b);
    }
    return row;
  }

  function barRow(icon, value, color) {
    const frag = document.createDocumentFragment();
    const i = document.createElement('span');
    i.textContent = icon;
    const bar = document.createElement('div');
    bar.className = 'bar';
    const fill = document.createElement('i');
    fill.style.width = value + '%';
    fill.style.background = value < 30 ? '#ff7b93' : color;
    bar.appendChild(fill);
    frag.append(i, bar);
    return frag;
  }

  function loveLabel(l) {
    if (l < 8) return 'Çekingen';
    if (l < 30) return 'Arkadaş';
    if (l < 80) return 'Can dostu';
    return 'Ruh ikizi';
  }

  function openCatMenu(c, x, y) {
    const m = document.createElement('div');
    const hd = document.createElement('div');
    hd.className = 'hd';
    hd.appendChild(SP.canvas('sit', 0, c.def.palette, { eyes: 'happy', blush: true }, 2));
    const info = document.createElement('div');
    info.style.flex = '1';
    const nm = document.createElement('div');
    nm.className = 'nm';
    nm.textContent = c.def.name;
    const sm = document.createElement('div');
    sm.className = 'sm';
    sm.textContent = '♥ ' + loveLabel(stat(c.id).love);
    const bars = document.createElement('div');
    bars.className = 'bars';
    bars.append(barRow('🐟', fullnessOf(c.id), '#7ccf5e'), barRow('💧', waterOf(c.id), '#5cbcec'));
    info.append(nm, sm, bars);
    hd.appendChild(info);
    m.appendChild(hd);

    const toss = (kind) => {
      const t = spawnToy(kind, x, y - 10, (c.x < x ? 1 : -1) * rand(250, 450) * K, -rand(350, 550) * K);
      if (t) c.go('play', { toy: t });
    };
    m.append(
      menuButton('🐾', 'Beni takip et (10 sn)', () => c.go('follow', { dur: 10 })),
      menuButton('💕', 'Sev', () => { c.lastPet = now(); addLove(c.id, 2); c.hearts(3); c.go('petted'); }),
      menuButton('🍽️', 'Mama / su kabına git', () => {
        const kind = waterOf(c.id) < fullnessOf(c.id) ? 'water' : 'food';
        const k = supply[kind] > 0 ? kind : supply[kind === 'water' ? 'food' : 'water'] > 0 ? (kind === 'water' ? 'food' : 'water') : null;
        k ? c.go('eat', { kind: k }) : c.go('stareBowl', { kind });
      }),
      menuButton('🌳', 'Kedi ağacına çık', () => c.go('climb'), !freePerches().length),
      menuButton('😴', 'Uyu', () => c.go('sleep')),
    );
    const sep = document.createElement('div');
    sep.className = 'sep';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = 'Oyuncak at';
    m.append(sep, title, toyButtons(toss));
    showMenu(m, x + 4, y + 4);
  }

  function openToyTray() {
    const r = D.basket.getBoundingClientRect();
    const m = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = 'Oyuncak sepeti';
    m.append(title, toyButtons((kind) => {
      spawnToy(kind, r.left + r.width / 2, r.top, rand(250, 520) * K, -rand(520, 760) * K);
    }));
    const sep = document.createElement('div');
    sep.className = 'sep';
    m.append(sep, menuButton('🧹', 'Oyuncakları topla', () => [...toys].forEach((t) => t.remove(true)), !toys.length));
    showMenu(m, r.left, r.top - 150);
  }

  // ---------- Kedi ----------
  const cats = new Map();

  function pickGroundX(self) {
    const minX = (D.end || 120) + 30;
    const maxX = tree.on ? tree.left - 10 : W() - 40;
    let best = rand(minX, Math.max(minX + 1, maxX)), bestScore = -1;
    for (let i = 0; i < 10; i++) {
      const x = rand(minX, Math.max(minX + 1, maxX));
      let score = 1e9;
      for (const c of cats.values()) if (c !== self && !c.pose.hidden) score = Math.min(score, Math.abs(c.x - x));
      if (score > bestScore) { bestScore = score; best = x; }
    }
    return best;
  }

  class Cat {
    constructor(def, delay) {
      this.def = def;
      this.id = def.id;
      this.el = document.createElement('canvas');
      this.el.width = BOX; this.el.height = BOX;
      this.el.className = 'cat';
      this.ctx = this.el.getContext('2d');
      L.cats.appendChild(this.el);
      this.sizeEl();
      this.x = -100; this.y = ground(); this.facing = 1;
      this.pose = { hidden: true };
      this.drawKey = '';
      this.perch = null;
      this.petAcc = 0; this.lastPet = -1e9; this.meowUntil = 0; this.lastName = -1e9;
      this.blinkAt = rand(1, 4); this.blinkUntil = 0; this.clock = 0;
      this.want = null; this.wantPlay = null; this.removing = false; this.press = null;
      this.hv = { x: 0, y: 0 };
      this.bindPointer();
      this.go('away', { dur: delay, next: 'enter' });
    }

    sizeEl() {
      this.el.style.width = this.el.style.height = BOX * S + 'px';
      this.drawKey = '';
    }

    destroy() {
      for (const k in supplyUser) if (supplyUser[k] === this.id) supplyUser[k] = null;
      releasePerch(this);
      this.el.remove();
      cats.delete(this.id);
    }

    go(state, data = {}) {
      if (this.perch != null) {
        const keep = PERCH_SNAP.includes(state) || state === 'climb' || (state === 'leap' && data.perch === this.perch);
        if (!keep) releasePerch(this);
      }
      for (const k in supplyUser) if (supplyUser[k] === this.id && state !== 'eat') supplyUser[k] = null;
      this.state = state;
      this.t = 0;
      this.data = data;
      const st = STATES[state];
      if (st.enter) st.enter(this, data);
    }

    pickWeighted(opts) {
      let r = Math.random() * opts.reduce((a, o) => a + o[1], 0);
      for (const [name, w, data] of opts) { if ((r -= w) < 0) return this.go(name, data || {}); }
      this.go('sit');
    }

    next() {
      if (this.removing) return this.go('leave');
      const full = fullnessOf(this.id), wet = waterOf(this.id);
      const hungry = full < 30, thirsty = wet < 30;

      if (this.perch != null) {
        if (hungry || thirsty || chance(0.22)) return this.jumpDown();
        return this.pickWeighted([
          ['sit', 25], ['lick', 15], ['sleep', this.perch === 2 ? 34 : 16],
          ['climb', freePerches().length ? 8 : 0],
        ]);
      }
      if (hungry && supply.food > 0) return this.go('eat', { kind: 'food' });
      if (thirsty && supply.water > 0) return this.go('eat', { kind: 'water' });
      if (hungry || thirsty) return this.needy(hungry && (!thirsty || full < wet) ? 'food' : 'water');

      if (this.y < ground() - 6 && chance(0.65)) return this.go('wander');
      const free = freePerches().length;
      this.pickWeighted([
        ['sit', 20], ['lick', 11], ['wander', 15],
        ['chase', mouse.inside ? 10 : 0],
        ['sleep', full > 50 ? 7 : 3],
        ['ambush', mouse.inside && now() - lastAmbush > 9000 ? 5 : 0],
        ['leave', 4],
        ['climb', free ? 11 : 0],
        ['scratchPost', tree.on ? 4 : 0],
        ['play', toys.length ? 12 : 0, { toy: nearestToy(this) }],
      ]);
    }

    // Aç/susuz ama kap boş: dikkat çekmeye çalış
    needy(kind) {
      const very = (kind === 'water' ? waterOf(this.id) : fullnessOf(this.id)) < 12;
      this.pickWeighted([
        ['beg', 22, { kind }],
        ['scratchScreen', very ? 40 : 26, { kind }],
        ['stareBowl', 20, { kind }],
        ['follow', mouse.inside ? 14 : 0, { kind, dur: 6, needy: true }],
        ['loudMeow', 12, { kind }],
      ]);
    }

    jumpDown(then, thenData) {
      const p = this.perch != null ? perchPos(this.perch) : { x: this.x };
      const dir = p.x > W() - 60 * S || chance(0.5) ? -1 : 1;
      this.go('leap', { x1: clamp(p.x + dir * rand(14, 22) * S, 20, W() - 20), y1: ground(), then: then || 'land', thenData });
    }

    moveTo(tx, ty, speed, dt) {
      const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
      if (Math.abs(dx) > 3) this.facing = Math.sign(dx);
      if (d <= speed * dt || d < 1) { this.x = tx; this.y = ty; return true; }
      this.x += (dx / d) * speed * dt;
      this.y += (dy / d) * speed * dt;
      return false;
    }

    head() {
      const n = this.pose.n;
      if (n === 'sit' || n === 'lick' || n === 'dangle') return { x: this.x, y: this.y - 18 * S };
      if (n === 'scratch') return { x: this.x, y: this.y - 27 * S };
      if (n === 'sleep') return { x: this.x + this.facing * 5 * S, y: this.y - 10 * S };
      return { x: this.x + this.facing * 6 * S, y: this.y - 15 * S };
    }

    say(text, ms, o) {
      const h = this.head();
      return bubble(text, h.x, h.y - 4, ms, o);
    }

    hearts(n = 1) {
      const h = this.head();
      for (let i = 0; i < n; i++) {
        setTimeout(() => fxSprite('heart', h.x + rand(-12, 12), h.y + 6, { dx: rand(-20, 20), dy: rand(-50, -35) }), i * 120);
      }
    }

    pet() {
      this.lastPet = now();
      addLove(this.id, 0.4);
      if (this.state === 'petted') return;
      if (this.state === 'sleep') { this.go('sit', { yawn: true }); return; }
      if (CALM.includes(this.state)) this.go('petted');
      else this.hearts(1);
    }

    click() {
      this.lastPet = now();
      addLove(this.id, 1);
      this.meowUntil = now() + 450;
      this.hearts(2);
      if (this.state === 'sleep') { this.go('sit', { yawn: true }); return; }
      this.say(pick(['miyav!', 'mrrp?', 'miyaav~', 'mrr ♥', 'prr?']), 1100);
      if (CALM.includes(this.state) && this.state !== 'petted') this.go('petted');
    }

    bindPointer() {
      const el = this.el;
      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        closeMenu();
        this.press = { x: e.clientX, y: e.clientY, moved: false };
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
      });
      el.addEventListener('pointermove', (e) => {
        mouse.x = e.clientX; mouse.y = e.clientY;
        if (this.press) {
          if (!this.press.moved && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > 6) {
            this.press.moved = true;
            this.go('held');
          }
          return;
        }
        this.petAcc += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
        if (this.petAcc > 80) { this.petAcc = 30; this.pet(); }
      });
      const release = (e) => {
        if (!this.press) return;
        const p = this.press;
        this.press = null;
        try { el.releasePointerCapture(e.pointerId); } catch (_) {}
        if (this.state === 'held') this.go('fall', { vx: this.hv.x, vy: this.hv.y });
        else if (!p.moved && e.type === 'pointerup') this.click();
      };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        openCatMenu(this, e.clientX, e.clientY);
      });
      el.addEventListener('pointerenter', () => {
        if (now() - this.lastName > 5000 && !this.press) {
          this.lastName = now();
          this.say(this.def.name, 1300, { cls: 'name' });
        }
      });
    }

    update(dt) {
      this.t += dt;
      this.clock += dt;
      this.petAcc = Math.max(0, this.petAcc - dt * 60);
      if (this.clock > this.blinkAt) {
        this.blinkUntil = this.clock + 0.14;
        this.blinkAt = this.clock + rand(2, 5.5);
      }
      const idle = CALM.includes(this.state) && this.state !== 'sleep' && this.state !== 'petted';
      if (this.want) {
        this.want.t -= dt;
        if (this.want.t <= 0) {
          // Meşgulse (kovalama, oyun...) biraz sonra tekrar dene
          if (supply[this.want.kind] <= 0 || this.state === 'eat') this.want = null;
          else if (idle || INTERACTIVE.includes(this.state) && this.state !== 'eat') {
            const kind = this.want.kind;
            this.want = null;
            if (this.perch != null) this.jumpDown('eat', { kind });
            else this.go('eat', { kind });
          } else this.want.t = 1.5;
        }
      }
      if (this.wantPlay) {
        this.wantPlay.t -= dt;
        if (this.wantPlay.t <= 0) {
          const toy = this.wantPlay.toy;
          this.wantPlay = null;
          if (toy.alive && idle) this.go('play', { toy });
        }
      }
      STATES[this.state].update(this, dt);
      if (this.perch != null && PERCH_SNAP.includes(this.state)) {
        const p = perchPos(this.perch);
        this.x = p.x; this.y = p.y;
      }
      this.render();
    }

    render() {
      const P = this.pose, el = this.el;
      if (P.hidden) {
        if (!this.hiddenNow) { el.style.display = 'none'; this.hiddenNow = true; }
        return;
      }
      if (this.hiddenNow) { el.style.display = ''; this.hiddenNow = false; }

      let eyes = P.eyes || 'open';
      if (eyes === 'open' && this.clock < this.blinkUntil) eyes = 'closed';
      const meow = !!P.meow || now() < this.meowUntil;
      let look = P.look;
      if (look === undefined) {
        const dx = mouse.x - this.x;
        look = !mouse.seen || Math.abs(dx) < 34 * K ? 0 : Math.sign(dx);
      }
      const frame = P.f || 0;
      const key = [P.n, frame, this.def.palette, eyes, look, P.blush ? 1 : 0, meow ? 1 : 0].join('|');
      if (key !== this.drawKey) {
        this.drawKey = key;
        const img = SP.imageData(P.n, frame, this.def.palette, { eyes, look, blush: P.blush, meow });
        this.ctx.clearRect(0, 0, BOX, BOX);
        this.ctx.putImageData(img, Math.round(BOX / 2 - SP.SPRITES[P.n].ax), BOX - img.height);
      }

      const bw = BOX * S;
      let tf;
      if (P.custom) {
        tf = `translate3d(${Math.round(P.custom.tx)}px,${Math.round(P.custom.ty)}px,0) rotate(${P.custom.rot}deg)`;
      } else {
        const tx = Math.round(this.x - bw / 2 + (P.ox || 0) * S);
        const ty = Math.round(this.y - bw + (P.oy || 0) * S);
        tf = `translate3d(${tx}px,${ty}px,0)`;
        if (P.rot) tf += ` rotate(${P.rot}deg)`;
        if (!SP.SPRITES[P.n].front && this.facing < 0) tf += ' scaleX(-1)';
      }
      if (tf !== this.lastTf) { el.style.transform = tf; this.lastTf = tf; }
      const cls = this.state === 'held' ? 'cat held' : INTERACTIVE.includes(this.state) ? 'cat int' : 'cat';
      if (cls !== el.className) el.className = cls;
    }
  }

  const fr = (c, fps, n) => Math.floor(c.t * fps) % n;
  const needIcon = (kind) => (kind === 'water' ? 'drop' : 'fish');

  // ---------- Davranışlar ----------
  const STATES = {
    away: {
      enter(c, d) { c.pose = { hidden: true }; d.dur = d.dur == null ? rand(2.5, 7) : d.dur; },
      update(c, dt) {
        c.pose = { hidden: true };
        if (c.removing) { c.destroy(); return; }
        if (c.t > c.data.dur) {
          const nx = c.data.next || (chance(0.4) ? 'peek' : 'enter');
          c.go(nx, { edge: c.data.edge });
        }
      },
    },

    enter: {
      enter(c, d) {
        const side = d.side || (chance(0.5) ? 1 : -1);
        c.x = side > 0 ? W() + 14 * S : -14 * S;
        c.y = ground();
        d.tx = d.tx || pickGroundX(c);
      },
      update(c, dt) {
        c.pose = { n: 'walk', f: fr(c, 8, 4) };
        if (c.moveTo(c.data.tx, ground(), 75 * K, dt)) c.go('sit');
      },
    },

    sit: {
      enter(c, d) { d.dur = d.dur || rand(4, 9); d.tail = 0; d.tailAt = rand(0.4, 1.2); },
      update(c, dt) {
        const d = c.data;
        if (c.t > d.tailAt) { d.tail ^= 1; d.tailAt = c.t + rand(0.3, 1.4); }
        const yawn = d.yawn && c.t < 0.8;
        c.pose = { n: 'sit', f: d.tail, eyes: yawn ? 'closed' : 'open', meow: yawn };
        if (yawn && !d.yawned) { d.yawned = true; c.say('*esner*', 900); }
        if (chance(dt * 0.035)) { c.meowUntil = now() + 400; c.say(pick(['miyav', 'mrr', 'miyav?']), 1000); }
        const dist = Math.hypot(mouse.x - c.x, mouse.y - (c.y - 10 * S));
        if (c.perch == null && mouse.inside && dist < 230 * K && mouse.speed > 900 && now() - mouse.last < 120 && chance(dt * 1.2)) {
          c.say('!', 600);
          return c.go('chase', { dur: rand(5, 10) });
        }
        // Aç / susuz kedi uzun oturmaz, derdini anlatır
        const needy = fullnessOf(c.id) < 30 || waterOf(c.id) < 30;
        if (c.t > d.dur || (needy && c.t > 2.5)) c.next();
      },
    },

    lick: {
      enter(c, d) { d.dur = d.dur || rand(3, 6); },
      update(c, dt) {
        const cyc = c.t % 1.7;
        c.pose = { n: 'lick', f: cyc < 1.2 ? fr(c, 3.5, 2) : 1, eyes: 'closed' };
        if (c.t > c.data.dur) chance(0.5) ? c.go('sit') : c.next();
      },
    },

    sleep: {
      enter(c, d) { d.dur = d.dur || rand(12, 28); d.zAt = 0.8; if (c.perch != null) c.facing = c.perch === 1 ? -1 : 1; },
      update(c, dt) {
        c.pose = { n: 'sleep', f: Math.floor(c.t * 0.8) % 2 };
        if (c.t > c.data.zAt) {
          c.data.zAt = c.t + 1.5;
          const h = c.head();
          fxText(pick(['z', 'Z', 'z']), h.x + c.facing * 6, h.y - 6, { dx: c.facing * 18, dy: -32, size: 11 + Math.random() * 6, dur: 1800 });
        }
        if (c.t > c.data.dur) c.go('sit', { yawn: true });
      },
    },

    wander: {
      enter(c, d) { d.tx = d.tx || pickGroundX(c); },
      update(c, dt) {
        c.pose = { n: 'walk', f: fr(c, 7, 4) };
        if (c.moveTo(c.data.tx, ground(), 60 * K, dt)) c.go(c.data.then || 'sit');
      },
    },

    leave: {
      enter(c, d) { d.dir = c.x < W() / 2 ? -1 : 1; },
      update(c, dt) {
        const d = c.data;
        c.pose = { n: 'walk', f: fr(c, 9, 4) };
        c.moveTo(d.dir < 0 ? -16 * S : W() + 16 * S, ground(), 85 * K, dt);
        if (c.x < -14 * S || c.x > W() + 14 * S) {
          c.go('away', { dur: rand(1, 3), next: 'peek', edge: d.dir < 0 ? 'left' : 'right' });
        }
      },
    },

    chase: {
      enter(c, d) { d.dur = d.dur || rand(8, 15); d.close = 0; },
      update(c, dt) {
        const d = c.data;
        if (!mouse.inside || c.t > d.dur) return c.go('wander');
        const side = c.x < mouse.x ? 1 : -1;
        const tx = clamp(mouse.x - side * 12 * S, 10, W() - 10);
        const ty = clamp(mouse.y + 10 * S, 16 * S, ground());
        const dist = Math.hypot(tx - c.x, ty - c.y);
        if (dist > 26 * K) {
          d.close = 0;
          c.moveTo(tx, ty, (170 + Math.min(dist, 600) * 0.6) * K, dt);
          c.pose = { n: 'walk', f: fr(c, 12, 4) };
        } else {
          c.facing = side;
          d.close += dt;
          c.pose = { n: 'sit', f: 0 };
          if (d.close > 0.8 && now() - mouse.last > 900 && chance(dt * 1.6)) {
            c.go('crouch', { next: chance(0.5) ? 'flee' : 'sit' });
          }
        }
      },
    },

    // Fareyi takip et (sağ tık menüsü) — saldırmaz, yanında yürür
    follow: {
      enter(c, d) {
        d.dur = d.dur || 10; d.meowAt = 1.5;
        if (d.needy) {
          const words = d.kind === 'water' ? ['suuu?', 'bak bana!', 'susadımm'] : ['mamaaa?', 'bak bana!', 'acıktımm'];
          c.say(pick(words), 1200, { icon: needIcon(d.kind) });
        }
        else c.say(pick(['takip ediyorum! 🐾', 'geliyorum!', 'nereye?']), 1200);
      },
      update(c, dt) {
        const d = c.data;
        if (c.t > d.dur) {
          if (!d.needy) c.say(pick(['tamam!', 'yoruldum...', 'mrr ♥']), 1000);
          return d.needy ? c.next() : c.go('wander');
        }
        if (d.needy && supply[d.kind] > 0) return c.go('eat', { kind: d.kind });
        const side = c.x < mouse.x ? 1 : -1;
        const tx = clamp(mouse.x - side * 14 * S, 10, W() - 10);
        const ty = clamp(mouse.y + 12 * S, 18 * S, ground());
        const dist = Math.hypot(tx - c.x, ty - c.y);
        if (dist > 20 * K) {
          c.moveTo(tx, ty, (120 + Math.min(dist, 700) * 0.9) * K, dt);
          c.pose = { n: 'walk', f: fr(c, dist > 150 ? 12 : 8, 4) };
        } else {
          c.facing = side;
          c.pose = { n: 'sit', f: fr(c, 1.5, 2), meow: d.needy && c.t % 1.8 < 0.4 };
        }
        if (d.needy && c.t > d.meowAt) { d.meowAt = c.t + 1.8; c.meowUntil = now() + 350; }
      },
    },

    crouch: {
      enter(c, d) { d.dur = rand(0.7, 1.3); },
      update(c, dt) {
        c.facing = mouse.x >= c.x ? 1 : -1;
        c.pose = { n: 'crouch', eyes: 'wide', ox: fr(c, 14, 2) ? 0.34 : -0.34 };
        if (Math.hypot(mouse.x - c.x, mouse.y - c.y) > 260 * K) return c.go('chase', { dur: rand(4, 8) });
        if (c.t > c.data.dur) {
          c.go('leap', {
            x1: clamp(mouse.x - c.facing * 8 * S, 0, W()),
            y1: clamp(mouse.y + S * 2, 12 * S, ground()),
            then: 'caught', thenData: { next: c.data.next },
          });
        }
      },
    },

    // Genel zıplama: (x1,y1)'e yay çizerek
    leap: {
      enter(c, d) {
        d.x0 = c.x; d.y0 = c.y;
        if (Math.abs(d.x1 - d.x0) > 2) c.facing = Math.sign(d.x1 - d.x0);
        const dist = Math.hypot(d.x1 - d.x0, d.y1 - d.y0);
        d.T = d.T || clamp(dist / 650, 0.3, 0.65);
        d.h = d.h == null ? 26 * K + dist * 0.22 : d.h;
        if (d.y0 >= ground() - 4) dust(c.x, c.y, 3);
      },
      update(c, dt) {
        const d = c.data;
        const p = Math.min(1, c.t / d.T);
        c.x = d.x0 + (d.x1 - d.x0) * p;
        c.y = d.y0 + (d.y1 - d.y0) * p - Math.sin(Math.PI * p) * d.h;
        c.pose = { n: 'jump', eyes: d.then === 'caught' ? 'wide' : 'open' };
        if (p >= 1) {
          if (d.perch != null) c.perch = d.perch;
          if (d.y1 >= ground() - 4) dust(c.x, c.y, 2);
          c.go(d.then || 'sit', d.thenData || {});
        }
      },
    },

    caught: {
      enter(c, d) {
        const mx = c.x + c.facing * 8 * S, my = c.y - S * 2;
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + rand(-0.3, 0.3);
          fxSprite('spark', mx, my, { dx: Math.cos(a) * 30, dy: Math.sin(a) * 30, dur: 600, scale: Math.max(2, S - 1) });
        }
        fxText(pick(['pıt!', 'hap!', 'pat!']), mx - 10, my - 20, { dy: -20, color: '#e0567a', size: 15, dur: 900 });
        c.say(pick(['yakaladım!', 'benimsin!', 'hehe!', '!!']), 900);
      },
      update(c, dt) {
        c.pose = { n: 'crouch', eyes: 'wide' };
        if (c.t > 0.75) {
          if (c.data.next === 'flee') c.go('flee', { dir: c.data.dir });
          else c.go('sit', { dur: rand(2, 4) });
        }
      },
    },

    flee: {
      enter(c, d) {
        d.dir = d.dir || (mouse.x < c.x ? 1 : -1);
        d.dustAt = 0;
        if (chance(0.6)) c.say(pick(['hihi!', 'kaç kaç!', 'miyav!', 'yakalayamazsın!']), 900);
      },
      update(c, dt) {
        const d = c.data;
        c.facing = d.dir;
        c.x += d.dir * 430 * K * dt;
        c.y += (ground() - c.y) * Math.min(1, dt * 3);
        c.pose = { n: 'walk', f: fr(c, 16, 4) };
        if (c.t > d.dustAt) { d.dustAt = c.t + 0.07; dust(c.x - d.dir * 6 * S, c.y, 1); }
        if (c.x < -16 * S || c.x > W() + 16 * S) c.go('away', { dur: rand(3, 8) });
      },
    },

    ambush: {
      enter(c, d) {
        lastAmbush = now();
        d.phase = c.pose.hidden ? 'hide' : 'exit';
        d.hide = rand(1, 2.5);
        d.dustAt = 0;
      },
      update(c, dt) {
        const d = c.data;
        if (d.phase === 'exit') {
          c.pose = { n: 'walk', f: fr(c, 11, 4) };
          c.moveTo(W() + 16 * S, ground(), 200 * K, dt);
          if (c.x > W() + 14 * S) { d.phase = 'hide'; c.t = 0; }
        } else if (d.phase === 'hide') {
          c.pose = { hidden: true };
          if (c.t > d.hide) {
            if (!mouse.inside) return c.go('enter', { side: 1 });
            d.phase = 'dash';
            c.x = W() + 12 * S;
            c.y = clamp(mouse.y + rand(-40, 80), 20 * S, ground());
          }
        } else {
          c.pose = { n: 'walk', f: fr(c, 16, 4) };
          c.moveTo(mouse.x + 8 * S, clamp(mouse.y + 2 * S, 12 * S, ground()), 470 * K, dt);
          if (c.t > d.dustAt) { d.dustAt = c.t + 0.06; dust(c.x + 6 * S, c.y, 1); }
          if (Math.hypot(mouse.x - c.x, mouse.y - c.y) < 150 * K) {
            lastAmbush = now();
            c.facing = -1;
            c.go('leap', {
              x1: clamp(mouse.x + 8 * S, 0, W()), y1: clamp(mouse.y + 2 * S, 12 * S, ground()),
              then: 'caught', thenData: { next: 'flee', dir: -1 },
            });
          }
        }
      },
    },

    peek: {
      enter(c, d) {
        d.edge = d.edge || pick(['left', 'right', 'bottom', 'bottom']);
        if (d.edge === 'right' && tree.on) d.edge = 'left';
        d.phase = 'in';
        d.stay = rand(3, 7);
        d.p = 0;
        if (d.edge === 'bottom') d.pos = pickGroundX(c);
        else d.pos = rand(90, Math.max(100, H() - 160));
      },
      update(c, dt) {
        const d = c.data;
        if (d.phase === 'in') { d.p = Math.min(1, d.p + dt * 2.2); if (d.p >= 1) { d.phase = 'stay'; c.t = 0; } }
        else if (d.phase === 'stay') { if (c.t > d.stay) d.phase = 'out'; }
        else {
          d.p = Math.max(0, d.p - dt * (d.shy ? 6 : 2.4));
          if (d.p <= 0) {
            return c.go('away', d.shy ? { dur: rand(1.5, 4), next: chance(0.5) ? 'peek' : 'enter' } : { dur: rand(1, 3), next: 'enter' });
          }
        }
        const e = d.p * d.p * (3 - 2 * d.p);
        const bw = BOX * S;
        let cx, cy, rot, look, hx, hy;
        if (d.edge === 'left') {
          cx = -7 * S + 10 * S * e; cy = d.pos; rot = 90;
          hx = cx + 2 * S; hy = cy;
          look = Math.abs(mouse.y - cy) < 30 ? 0 : Math.sign(mouse.y - cy);
        } else if (d.edge === 'right') {
          cx = W() + 7 * S - 10 * S * e; cy = d.pos; rot = -90;
          hx = cx - 2 * S; hy = cy;
          look = Math.abs(mouse.y - cy) < 30 ? 0 : Math.sign(cy - mouse.y);
        } else {
          cx = d.pos; cy = H() + 7 * S - 10 * S * e; rot = 0;
          hx = cx; hy = cy - 2 * S;
          look = Math.abs(mouse.x - cx) < 30 ? 0 : Math.sign(mouse.x - cx);
        }
        c.x = hx; c.y = hy + 12 * S;
        c.pose = { n: 'sit', f: 0, look: mouse.seen ? look : 0, custom: { tx: cx - bw / 2, ty: cy - bw / 2, rot } };
        if (d.phase === 'stay' && mouse.inside && Math.hypot(mouse.x - hx, mouse.y - hy) < 85 * K) {
          d.phase = 'out'; d.shy = true;
          fxText('!', hx - 4, hy - 30, { dy: -14, size: 18, color: '#e0567a', dur: 700 });
        }
      },
    },

    // Mama yeme / su içme (d.kind = food | water)
    eat: {
      enter(c, d) { d.kind = d.kind || 'food'; d.phase = 'go'; },
      update(c, dt) {
        const d = c.data, kind = d.kind;
        const ex = bowlX(kind) + 7 * S;
        const busy = supplyUser[kind] && supplyUser[kind] !== c.id;
        if (d.phase === 'go') {
          // Uzaksa mamaya koşar
          const far = Math.abs(ex - c.x) > 150;
          c.pose = { n: 'walk', f: fr(c, far ? 13 : 9, 4) };
          if (c.moveTo(busy ? ex + 22 * S : ex, ground(), (far ? 330 : 90) * K, dt)) {
            c.facing = -1;
            if (busy) { d.phase = 'wait'; c.t = 0; }
            else if (supply[kind] <= 0) c.go('stareBowl', { kind });
            else {
              supplyUser[kind] = c.id;
              setSupply(kind, supply[kind] - 1);
              nourish(c.id, kind, kind === 'water' ? 50 : 45);
              d.phase = 'eat'; c.t = 0; d.nomAt = 0.6;
            }
          }
        } else if (d.phase === 'wait') {
          c.pose = { n: 'sit', f: fr(c, 1.5, 2) };
          if (!supplyUser[kind]) d.phase = 'go';
          else if (c.t > 9) c.go('sit');
        } else {
          c.x = ex; c.y = ground(); c.facing = -1;
          c.pose = { n: 'eat', f: fr(c, kind === 'water' ? 6 : 4, 2), eyes: 'closed' };
          if (c.t > d.nomAt) {
            d.nomAt = c.t + 1.3;
            const words = kind === 'water' ? ['şap şap', 'lap lap', 'şap'] : ['nom', 'nom nom', 'çıtır'];
            fxText(pick(words), c.x - 10 * S, c.y - 14 * S, { dy: -22, size: 11, color: kind === 'water' ? '#3f8fc4' : '#8f5a2b', dur: 1100 });
          }
          if (c.t > (kind === 'water' ? 3.5 : 5)) {
            supplyUser[kind] = null;
            c.hearts(1);
            // Tokken bir de su içsin / yalansın
            const other = kind === 'water' ? 'food' : 'water';
            const otherNeed = other === 'water' ? waterOf(c.id) : fullnessOf(c.id);
            if (otherNeed < 60 && supply[other] > 0) c.go('eat', { kind: other });
            else c.go('lick', { dur: rand(3, 5) });
          }
        }
      },
    },

    beg: {
      enter(c, d) { d.kind = d.kind || 'food'; d.dur = 4.5; c.say('', 1600, { icon: needIcon(d.kind) }); },
      update(c, dt) {
        const d = c.data;
        c.pose = { n: 'sit', f: fr(c, 2, 2), meow: c.t % 1.5 < 0.4 };
        if (c.t > 2 && !d.said) {
          d.said = true;
          c.say(d.kind === 'water' ? pick(['susadım...', 'su? su!', 'miyav... su']) : pick(['acıktım...', 'miyav? mama?', 'mama!']), 1300);
        }
        if (supply[d.kind] > 0 && c.perch == null) return c.go('eat', { kind: d.kind });
        if (c.t > d.dur) chance(0.4) && c.perch == null ? c.go('wander', { then: 'sit' }) : c.go('sit');
      },
    },

    // Açken ekranı tırmalar!
    scratchScreen: {
      enter(c, d) {
        d.kind = d.kind || 'food';
        d.phase = 'go';
        d.tx = clamp(mouse.inside ? mouse.x + rand(-80, 80) : rand(200, W() - 200), (D.end || 100) + 40, (tree.on ? tree.left : W()) - 30);
        d.last = -1;
      },
      update(c, dt) {
        const d = c.data;
        if (supply[d.kind] > 0) return c.go('eat', { kind: d.kind });
        if (d.phase === 'go') {
          c.pose = { n: 'walk', f: fr(c, 10, 4) };
          if (c.moveTo(d.tx, ground(), 110 * K, dt)) {
            d.phase = 'scratch'; c.t = 0;
            c.say(d.kind === 'water' ? pick(['SUUU!', 'susadıııım!']) : pick(['MAMAAA!', 'acıktıııım!', 'mama veeer!']), 1400, { cls: 'loud' });
          }
          return;
        }
        const f = fr(c, 6, 2);
        c.pose = { n: 'scratch', f, eyes: 'open', meow: c.t % 1.4 < 0.35 };
        if (f !== d.last) {
          d.last = f;
          // Yukarıdaki pati aşağı çekilir -> iz bırakır
          const sx = f === 0 ? 1.5 : 18.5;
          const px = c.x - 12 * S + (2 + sx) * S + rand(-4, 4);
          const py = c.y - 24 * S + rand(-3, 6);
          clawMark(px, py);
          if (chance(0.3)) fxText(pick(['tırt', 'cırt', 'hırt']), px, py - 8, { dy: -16, size: 11, color: '#9b6b50', dur: 800 });
        }
        if (c.t > 3.6) c.go('beg', { kind: d.kind });
      },
    },

    // Boş kabın başında oturup bakar, kaba pati atar
    stareBowl: {
      enter(c, d) { d.kind = d.kind || 'food'; d.phase = 'go'; d.tapAt = 1; },
      update(c, dt) {
        const d = c.data;
        if (supply[d.kind] > 0) return c.go('eat', { kind: d.kind });
        const bx = bowlX(d.kind);
        if (d.phase === 'go') {
          const far = Math.abs(bx + 10 * S - c.x) > 150;
          c.pose = { n: 'walk', f: fr(c, far ? 13 : 9, 4) };
          if (c.moveTo(bx + 10 * S, ground(), (far ? 300 : 90) * K, dt)) { d.phase = 'stare'; c.t = 0; c.say('', 1600, { icon: needIcon(d.kind) }); }
          return;
        }
        c.pose = { n: 'sit', f: fr(c, 1.5, 2), meow: c.t % 2 < 0.4 };
        if (c.t > d.tapAt) {
          d.tapAt = c.t + 1.8;
          jiggle(d.kind === 'water' ? D.water : D.food);
          fxText('tık', bx, ground() - 14 * S, { dy: -12, size: 11, color: '#9b6b50', dur: 700 });
        }
        if (c.t > 6) c.go('beg', { kind: d.kind });
      },
    },

    loudMeow: {
      enter(c, d) {
        d.kind = d.kind || 'food';
        c.say(pick(['MİYAAAAV!', 'MİYAV MİYAV!', 'MRAAAV!']), 1500, { cls: 'loud' });
      },
      update(c, dt) {
        c.pose = { n: 'sit', f: 0, meow: c.t < 1.4, ox: c.t < 1.4 ? (fr(c, 20, 2) ? 0.34 : -0.34) : 0 };
        if (c.t > 2.4) c.next();
      },
    },

    petted: {
      enter(c, d) { d.heartAt = 0; c.say(pick(['prrr ♥', 'mrrr~', 'prrrrr', '♥ ♥']), 1200); },
      update(c, dt) {
        const d = c.data;
        const active = now() - c.lastPet < 700;
        c.pose = { n: 'sit', f: fr(c, 3, 2), eyes: 'happy', blush: true };
        if (active) addLove(c.id, dt * 0.6);
        if (active && c.t > d.heartAt) { d.heartAt = c.t + 0.4; c.hearts(1); }
        if (now() - c.lastPet > 1700) c.go('sit', { dur: rand(2, 5) });
      },
    },

    held: {
      enter(c, d) {
        c.say(pick(['mrrp?!', 'miyav!', 'beni indir!', 'uçuyorum!']), 1000);
      },
      update(c, dt) {
        const tx = mouse.x, ty = mouse.y + 19 * S;
        const nx = c.x + (tx - c.x) * Math.min(1, dt * 18);
        const ny = c.y + (ty - c.y) * Math.min(1, dt * 18);
        if (dt > 0) {
          c.hv.x = c.hv.x * 0.7 + ((nx - c.x) / dt) * 0.3;
          c.hv.y = c.hv.y * 0.7 + ((ny - c.y) / dt) * 0.3;
        }
        c.x = nx; c.y = ny;
        c.pose = { n: 'dangle', f: fr(c, 2.5, 2), rot: clamp(-c.hv.x * 0.025, -24, 24) };
      },
    },

    fall: {
      enter(c, d) { d.vx = clamp(d.vx || 0, -1500, 1500); d.vy = clamp(d.vy || 0, -1200, 1500); },
      update(c, dt) {
        const d = c.data;
        d.vy += 2400 * K * dt;
        d.vx *= 1 - Math.min(1, dt * 1.2);
        c.x += d.vx * dt;
        c.y += d.vy * dt;
        const minX = 8 * S, maxX = W() - 8 * S;
        if (c.x < minX) { c.x = minX; d.vx = Math.abs(d.vx) * 0.5; }
        if (c.x > maxX) { c.x = maxX; d.vx = -Math.abs(d.vx) * 0.5; }
        c.pose = { n: 'dangle', f: 1, eyes: 'wide', rot: clamp(-d.vx * 0.02, -30, 30) };
        // Kedi ağacının rafına konabilir
        if (d.vy > 0 && tree.on) {
          for (const i of freePerches()) {
            const p = perchPos(i);
            if (Math.abs(c.x - p.x) < 7 * S && c.y >= p.y && c.y - d.vy * dt < p.y) {
              c.x = p.x; c.y = p.y;
              perchOwner[i] = c.id; c.perch = i;
              return c.go('sit', { dur: rand(3, 6) });
            }
          }
        }
        if (c.y >= ground()) {
          c.y = ground();
          dust(c.x, c.y, 5);
          c.go('land', { hard: d.vy > 1100 });
        }
      },
    },

    land: {
      enter(c, d) { if (d.hard) c.say(pick(['oha!', 'pat!', '4 ayak üstü!']), 900); },
      update(c, dt) {
        c.pose = { n: 'crouch', eyes: c.t < 0.2 ? 'closed' : 'open' };
        if (c.t > 0.4) {
          const needy = fullnessOf(c.id) < 30 || waterOf(c.id) < 30;
          needy ? c.next() : c.go('sit', { dur: rand(2, 4) });
        }
      },
    },

    // Kedi ağacına tırman
    climb: {
      enter(c, d) {
        const free = freePerches();
        if (!free.length) { d.fail = true; return; }
        const from = c.perch;
        let i = d.perch != null && free.includes(d.perch) ? d.perch : pick(free);
        if (from != null) {
          const higher = free.filter((k) => SP.TREE_PERCHES[k].top < SP.TREE_PERCHES[from].top);
          if (higher.length && chance(0.7)) i = pick(higher);
          releasePerch(c);
        }
        perchOwner[i] = c.id; c.perch = i;
        d.target = i;
        d.fromPerch = from != null;
        const p = perchPos(i);
        d.lx = clamp(p.x + (c.x < p.x ? -14 : 14) * S, 20, W() - 20);
        if (i === 1) d.lx = clamp(p.x - 16 * S, 20, W() - 20);
      },
      update(c, dt) {
        const d = c.data;
        if (d.fail) return c.go('sit');
        const p = perchPos(d.target);
        if (!d.fromPerch) {
          c.pose = { n: 'walk', f: fr(c, 9, 4) };
          if (!c.moveTo(d.lx, ground(), 150 * K, dt)) return;
          c.pose = { n: 'crouch' };
        }
        c.go('leap', { x1: p.x, y1: p.y, perch: d.target, T: 0.55, h: 30 * S, then: 'sit', thenData: { dur: rand(4, 8) } });
      },
    },

    // Kedi ağacının direğini tırmala
    scratchPost: {
      enter(c, d) { d.phase = 'go'; },
      update(c, dt) {
        const d = c.data;
        if (!tree.on) return c.go('sit');
        const px = tree.left + 29 * S;
        if (d.phase === 'go') {
          c.pose = { n: 'walk', f: fr(c, 8, 4) };
          if (c.moveTo(px, ground(), 80 * K, dt)) { d.phase = 'scratch'; c.t = 0; }
          return;
        }
        const f = fr(c, 6, 2);
        c.pose = { n: 'scratch', f, eyes: 'closed' };
        if (f !== d.last) { d.last = f; if (chance(0.5)) dust(px + rand(-12, 12), c.y - rand(8, 18) * S, 1, '#ecd29d'); }
        if (c.t > rand(2.5, 4)) c.go('sit');
      },
    },

    // Oyuncakla oyna
    play: {
      enter(c, d) {
        d.toy = d.toy || nearestToy(c);
        d.dur = d.dur || rand(7, 15);
        d.cd = d.batNow ? 0 : 0.3;
        d.idle = 0; d.batT = 0;
        if (d.batNow && d.toy && Math.hypot(d.toy.x - c.x, d.toy.y - c.y) < 20 * S) {
          STATES.play.bat(c, d, d.toy, true);
        } else if (!d.batNow && chance(0.4)) c.say(pick(['oyun!', '!!', 'o ne?']), 700);
      },
      bat(c, d, toy, big) {
        const side = toy.x >= c.x ? 1 : -1;
        if (!toy.held) toy.kick(side * rand(big ? 380 : 250, big ? 700 : 520) * K, -rand(160, big ? 520 : 420) * K);
        fxText(pick(['pat!', 'pıt!', 'tık!']), toy.x - 8, toy.y - 16, { dy: -16, size: 12, color: '#e0567a', dur: 700 });
        if (big) fxSprite('spark', toy.x, toy.y, { dy: -20, dur: 500 });
        d.batT = 0.25;
        d.cd = rand(0.5, 1.3);
      },
      update(c, dt) {
        const d = c.data, toy = d.toy;
        if (!toy || !toy.alive) return c.go('sit');
        if (c.t > d.dur) { if (chance(0.5)) c.say(pick(['oh be!', 'yoruldum', 'mrr']), 900); return chance(0.5) ? c.go('lick') : c.go('sit'); }
        d.cd -= dt; d.batT -= dt;
        const side = c.x < toy.x ? 1 : -1;
        const floorY = ground() - toy.h / 2 + S;
        const airborne = toy.y < floorY - 30 * K;

        if (toy.held) {
          // Havada sallanan oyuncağa zıpla
          const tx = clamp(toy.x - side * 12 * S, 10, W() - 10);
          const ty = clamp(toy.y + 14 * S, 18 * S, ground());
          const dist = Math.hypot(tx - c.x, ty - c.y);
          if (dist > 24 * K) { c.moveTo(tx, ty, 200 * K, dt); c.pose = { n: 'walk', f: fr(c, 12, 4) }; }
          else {
            c.facing = side;
            c.pose = { n: 'crouch', eyes: 'wide', ox: fr(c, 14, 2) ? 0.34 : -0.34 };
            if (d.cd <= 0 && chance(dt * 2.5)) {
              return c.go('leap', { x1: clamp(toy.x - side * 7 * S, 0, W()), y1: clamp(toy.y + 3 * S, 12 * S, ground()),
                then: 'play', thenData: { toy, dur: d.dur - c.t, batNow: true } });
            }
          }
          return;
        }

        const tx = clamp(toy.x - side * 9 * S, 10, W() - 10);
        const dx = Math.abs(tx - c.x) + Math.abs(ground() - c.y) * 0.5;
        // Düşen oyuncağı havada yakala
        if (airborne && d.cd <= 0 && toy.vy > 0 && Math.abs(toy.x - c.x) < 70 * K && toy.y > ground() - 45 * S && chance(dt * 4)) {
          return c.go('leap', { x1: clamp(toy.x - side * 7 * S, 0, W()), y1: clamp(toy.y + 3 * S, 12 * S, ground()),
            then: 'play', thenData: { toy, dur: d.dur - c.t, batNow: true } });
        }
        if (dx > 6 * S) {
          d.idle = 0;
          c.moveTo(tx, ground(), (toy.speed > 100 ? 250 : 140) * K, dt);
          c.pose = { n: 'walk', f: fr(c, toy.speed > 100 ? 14 : 9, 4) };
          return;
        }
        c.facing = side;
        if (d.batT > 0) { c.pose = { n: 'crouch', eyes: 'wide' }; return; }
        if (!airborne && d.cd <= 0) {
          if (chance(0.25)) {
            return c.go('leap', { x1: clamp(toy.x - side * 7 * S, 0, W()), y1: ground(), h: 22 * S, T: 0.4,
              then: 'play', thenData: { toy, dur: d.dur - c.t, batNow: true } });
          }
          STATES.play.bat(c, d, toy, false);
        }
        c.pose = toy.speed < 15 ? { n: 'sit', f: fr(c, 2, 2) } : { n: 'crouch', eyes: 'wide', ox: fr(c, 14, 2) ? 0.34 : -0.34 };
        if (toy.speed < 15) {
          d.idle += dt;
          if (d.idle > 3 && chance(dt * 0.5)) c.go('sit');
        }
      },
    },
  };

  // Yalnızca yerel test sayfası için (eklentide content script yalıtılmış dünyada çalışır, sayfa bunu göremez)
  if (window.__miyavTest) Object.assign(window.__miyavTest, { cats, toys, tree, perchOwner, perchPos });

  // ---------- Döngü ----------
  let last = 0;
  function loop(t) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (t - last) / 1000 || 0);
    last = t;
    for (const toy of [...toys]) toy.update(dt);
    for (const c of [...cats.values()]) c.update(dt);
  }

  function siteDisabled() {
    return (settings.disabledSites || []).includes(location.hostname);
  }

  function sync() {
    const active = settings.enabled && !siteDisabled() && catDefs.length > 0;
    if (!active) {
      if (host) {
        cancelAnimationFrame(raf); raf = 0;
        closeMenu();
        for (const c of [...cats.values()]) c.destroy();
        for (const t of [...toys]) t.remove();
        host.remove();
        host = layer = treeEl = null;
        for (const k in L) delete L[k];
        for (const k in D) delete D[k];
        supplyUser.food = supplyUser.water = null;
        perchOwner.fill(null);
      }
      return;
    }
    ensureHost();
    const newS = clamp(Number(settings.scale) || 3, 2, 5);
    if (newS !== S) {
      S = newS; K = S / 3;
      for (const c of cats.values()) c.sizeEl();
      for (const t of toys) t.size();
      layoutAll();
    }
    const treeWas = tree.on;
    layoutTree();
    if (treeWas && !tree.on) {
      // Ağaç kaldırıldı: raftakiler aşağı düşsün
      for (const c of cats.values()) if (c.perch != null) { releasePerch(c); c.go('fall', {}); }
    }
    const ids = new Set(catDefs.map((d) => d.id));
    for (const c of cats.values()) {
      if (!ids.has(c.id) && !c.removing) {
        c.removing = true;
        if (c.pose.hidden) c.destroy();
        else c.go('flee', { dir: c.x < W() / 2 ? -1 : 1 });
      }
    }
    let i = 0;
    for (const def of catDefs) {
      const c = cats.get(def.id);
      if (c) { c.def = def; c.drawKey = ''; }
      else cats.set(def.id, new Cat(def, 0.3 + i++ * rand(0.8, 1.6)));
    }
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
  }

  function handleCommand(cmd) {
    if (!cmd || Date.now() - cmd.at > 4000 || document.visibilityState !== 'visible' || !host) return;
    const list = [...cats.values()].filter((c) => !c.removing);
    if (!list.length) return;
    if (cmd.type === 'summon') {
      list.forEach((c) => {
        if (c.pose.hidden) c.go('enter', { side: chance(0.5) ? 1 : -1 });
        else if (INTERACTIVE.includes(c.state)) c.go('follow', { dur: 10 });
      });
    } else if (cmd.type === 'ambush') {
      const c = list.find((x) => x.id === cmd.id) || pick(list);
      if (c.state !== 'held') c.go('ambush');
    } else if (cmd.type === 'toy') {
      spawnToy(cmd.kind || 'ball', W() / 2, H() / 3, rand(-400, 400), -300);
    }
  }

  // ---------- Depolama ----------
  chrome.storage.local.get(null).then((all) => {
    settings = Object.assign({}, DEFAULT_SETTINGS, all.settings || {});
    catDefs = all.cats || [];
    supply.food = all.bowl || 0;
    supply.water = all.water || 0;
    for (const k in all) if (k.startsWith('stat_')) stats[k.slice(5)] = all[k];
    sync();
  }).catch(() => {});

  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    let resync = false;
    if (ch.settings) { settings = Object.assign({}, DEFAULT_SETTINGS, ch.settings.newValue || {}); resync = true; }
    if (ch.cats) { catDefs = ch.cats.newValue || []; resync = true; }
    for (const k in ch) {
      if (k.startsWith('stat_') && ch[k].newValue) stats[k.slice(5)] = ch[k].newValue;
    }
    for (const [key, kind] of [['bowl', 'food'], ['water', 'water']]) {
      if (!ch[key]) continue;
      const nv = ch[key].newValue || 0;
      const filled = nv > supply[kind];
      supply[kind] = nv;
      drawSupply();
      if (filled) callCats(kind);
    }
    if (resync) sync();
    if (ch.command) handleCommand(ch.command.newValue);
  });

  // Pencere boyutu değişince yerdeki/raftaki her şey hemen yeni zemine otursun
  let lastGround = ground();
  addEventListener('resize', () => {
    const g = ground(), dy = g - lastGround;
    lastGround = g;
    if (!host) return;
    layoutTree();
    for (const t of toys) if (Math.abs(t.y - (g - dy - t.h / 2 + S)) < 3) t.y += dy;
    for (const c of cats.values()) {
      if (c.perch != null && PERCH_SNAP.includes(c.state)) { const p = perchPos(c.perch); c.x = p.x; c.y = p.y; }
      else if (Math.abs(c.y - (g - dy)) < 3) c.y = g;
      if (c.perch == null && (c.state === 'sit' || c.state === 'lick' || c.state === 'sleep')) c.x = clamp(c.x, 20, W() - 20);
      c.render();
    }
  });
})();
