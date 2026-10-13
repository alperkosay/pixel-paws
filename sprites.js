// Miyav! — pixel art sprite verileri ve renderer.
// Hem content script'te (globalThis.MiyavSprites) hem de Node'da (önizleme/ikon üretimi) çalışır.
(function (root) {
  'use strict';

  // Karakterler:
  //  .  saydam      o  kontur      b  gövde      d  çizgi/koyu   w  beyaz/göbek
  //  p  pembe       E  göz (moduna göre çizilir)  _  (overlay'de) sil
  //  R/r kap, k kap içi, f/F mama, y/Y çuval, B balık, H/h kalp, s parıltı

  // ---------- Önden oturan kedi ----------
  const SIT_HEAD = [
    '..o..........o......',
    '.obo........obo.....',
    '.obpo......opbo.....',
    'obppboooooobppbo....',
    'obbbbbdbbdbbbbbo....',
    'obbbbbbbbbbbbbbo....',
    'obbbEEbbbbEEbbbo....',
    'obbbEEbbbbEEbbbo....',
    'obbbbbwppwbbbbbo....',
    '.obbbwwoowwbbbo.....',
    '..oobbbbbbbboo......',
  ];

  const SIT_A = SIT_HEAD.concat([
    '..obbbbwwbbbbo......',
    '.obbbbwwwwbbbbo..oo.',
    '.obbbwwwwwwbbbo.obbo',
    '.obbbwwwwwwbbbo.obo.',
    '.obbwwowwowwbbooobo.',
    '..ooooooooooooobbo..',
    '...............oo...',
  ]);

  const SIT_B = SIT_HEAD.concat([
    '..obbbbwwbbbbo......',
    '.obbbbwwwwbbbbo.....',
    '.obbbwwwwwwbbbo.....',
    '.obbbwwwwwwbbbo.ooo.',
    '.obbwwowwowwbbooobbo',
    '..ooooooooooooobboo.',
    '...............oo...',
  ]);

  // ---------- Yandan kedi (sağa bakar) ----------
  const SIDE_TOP = [
    '..............o....o..',
    '.............obo..obo.',
    '.oo..........obpoopbo.',
    'obbo........obbbbbbbbo',
    '.obbo.......obbEbbbEbo',
    '..obo.......obbEbbbEbo',
    '...obooooooobbbbbpbbbo',
    '...obbdbbdbbbbbbbobbo.',
    '...obbdbbdbbbbbbbbboo.',
    '...obbbbbbbbbbbbbbo...',
    '...obwwwwwwwwwwwbbo...',
  ];

  const LEGS = {
    A: [
      '...obbooooooooobbo....',
      '...obbo.......obbo....',
      '...owwo.......owwo....',
      '....oo.........oo.....',
    ],
    B: [
      '...obbooooooooobbo....',
      '....obbo.....obbo.....',
      '.....owwo...owwo......',
      '......oo.....oo.......',
    ],
    C: [
      '...obbooooooooobbo....',
      '..obbo.........obbo...',
      '.owwo...........owwo..',
      '..oo.............oo...',
    ],
    JUMP: [
      '.obbboooooooooooobbbo.',
      'obwo..............owwo',
      'oo.................oo.',
    ],
    CROUCH: [
      '...owwooooooooowwo....',
      '....oo.........oo.....',
    ],
  };

  // Başsız gövde (yemek yerken kafa aşağıda)
  const BODY_NOHEAD = [
    '......................',
    '......................',
    '.oo...................',
    'obbo..................',
    '.obbo.................',
    '..obo.................',
    '...obooooooooooo......',
    '...obbdbbdbbbbbbo.....',
    '...obbdbbdbbbbbbbo....',
    '...obbbbbbbbbbbbbbo...',
    '...obwwwwwwwwwwwbbo...',
  ].concat(LEGS.A);

  const SIDE_HEAD = [
    '..o....o..',
    '.obo..obo.',
    '.obpoopbo.',
    'obbbbbbbbo',
    'obbEbbbEbo',
    'obbEbbbEbo',
    'obbbbpbbbo',
    '.obbbobbo.',
    '..oooooo..',
  ];

  // ---------- Uyuyan kedi (somun) ----------
  const SLEEP_A = [
    '.............o....o...',
    '............obo..obo..',
    '....oooooooobpoooopbo.',
    '..oobbdbbdbobbbbbbbbo.',
    '.obbbdbbdbbobbbbbbbbo.',
    '.obbbdbbdbboboobboobo.',
    'obbbbbbbbbbobbwppwbbo.',
    'obbbbbbbbbbbowwwwwwo..',
    'obboddddddddddddddo...',
    '.oooooooooooooooooo...',
  ];
  const SLEEP_B = [
    '.............o....o...',
    '....ooooooo.obo..obo..',
    '..oobbbbbbbobpoooopbo.',
    '.obbbdbbdbbobbbbbbbbo.',
    '.obbbdbbdbbobbbbbbbbo.',
    '.obbbdbbdbboboobboobo.',
    'obbbbbbbbbbobbwppwbbo.',
    'obbbbbbbbbbbowwwwwwo..',
    'obboddddddddddddddo...',
    '.oooooooooooooooooo...',
  ];

  // ---------- Ensesinden tutulan kedi ----------
  const DANGLE_BODY = [
    '...obbbwwbbbo...',
    '..obbbwwwwbbbo..',
    '.owbbbwwwwbbbwo.',
    '.oo.obwwwwbo.oo.',
    '....obwwwwbo....',
    '....obbbbbbo....',
    '...obbobbobbo...',
    '...owwobbowwo...',
  ];
  const DANGLE_A = SIT_HEAD.map((r) => r.slice(0, 16)).concat(DANGLE_BODY, [
    '....oo.obo.oo...',
    '.......obo......',
    '........o.......',
  ]);
  const DANGLE_B = SIT_HEAD.map((r) => r.slice(0, 16)).concat(DANGLE_BODY, [
    '....oo.obbo.oo..',
    '........obo.....',
    '.........o......',
  ]);

  // ---------- Eşyalar ----------
  const BOWL = [
    '................',
    '................',
    '................',
    '.oooooooooooooo.',
    'oRkkkkkkkkkkkkRo',
    'oRRRRRRRRRRRRRRo',
    'orRRRRhRRhRRRRro',
    '.orrRRRRRRRRrro.',
    '..orrrrrrrrrro..',
    '...oooooooooo...',
  ];

  const BAG = [
    '..oooooooo..',
    '..oYyYyYyo..',
    '...oyyyyo...',
    '..oyyyyyyo..',
    '.oyyyyyyyyo.',
    'oyyyyyyyyyyo',
    'oyyyBBByByyo',
    'oyyBoBBBByyo',
    'oyyyBBByByyo',
    'oyyyyyyyyyyo',
    'oYyyyyyyyyYo',
    '.oYYyyyyYYo.',
    '..oooooooo..',
  ];

  const HEART = [
    '.oo.oo.',
    'oHhoHHo',
    'oHHHHHo',
    '.oHHHo.',
    '..oHo..',
    '...o...',
  ];

  const FISH = [
    '..ooo..o.',
    '.oBBBooBo',
    'oBoBBBBBo',
    '.oBBBooBo',
    '..ooo..o.',
  ];

  const SPARK = [
    '..s..',
    '..s..',
    'ss.ss',
    '..s..',
    '..s..',
  ];

  const DROP = [
    '..o..',
    '.oAo.',
    'oAAAo',
    'oAWAo',
    '.ooo.',
  ];

  const JUG = [
    '...oooo...',
    '...ouuo...',
    '..oUUUUo..',
    '.oAAAAAAo.',
    'oAWAAAAAAo',
    'oAWAAAAAAo',
    'oAAAAAAAao',
    'oAAAAAAAao',
    'oaAAAAAAao',
    '.oaaaaaao.',
    '..oooooo..',
  ];

  const BASKET = [
    '...ooo..oooo...',
    '..oXhXooVvVVo..',
    '..oXXxovVvVvo..',
    '.ooooooooooooo.',
    'oKkKKkKKkKKkKKo',
    'oKKkKKkKKkKKkKo',
    '.oKkKKkKKkKKko.',
    '.oKKkKKkKKkKKo.',
    '..ooooooooooo..',
  ];

  const BALL = [
    '..ooo..',
    '.oXXXo.',
    'oXhXXXo',
    'oXXXXXo',
    'oXXXXxo',
    '.oXxxo.',
    '..ooo..',
  ];

  const YARN = [
    '..oooo...',
    '.oVvVVo..',
    'oVVvVvVo.',
    'ovVVvVVo.',
    'oVvVVvVo.',
    'oVVvVvvo.',
    '.oVVvVo..',
    '..ooooovv',
  ];

  const TOYMOUSE = [
    '.oo.......',
    'opo.......',
    'oGGoo.....',
    'oGoGGGo...',
    'pGGGGGGo..',
    '.oGGjjGoo.',
    '..ooooo..oo',
  ];

  // Ön tırmalama pozu: arka ayaklarında durur, patiler havada
  const SCRATCH_BASE = ['', '', ''].concat(SIT_HEAD.map((r) => '..' + r.slice(0, 16) + '..'), [
    '...obbbbwwwwbbbbo...',
    '...obbbwwwwwwbbbo...',
    '...obbbwwwwwwbbbo...',
    '...obbbwwwwwwbbbo...',
    '....obbwwwwwwbbo....',
    '....obbbwwwwbbbo....',
    '....obbobbbbobbo....',
    '....obbo.oo.obbo....',
    '....owwo....owwo....',
    '.....oo......oo.....',
  ]);
  const ARM_L = ['.oo.', 'owwo', 'owwo'].concat(Array(10).fill('obbo'), ['.obbo']);
  const ARM_R = ARM_L.map((r) => r.padEnd(5, '.').split('').reverse().join(''));

  // Katlı kedi ağacı (sisal direkler + halı kaplı raflar + en üstte yatak)
  function buildTree() {
    const TW = 36, TH = 60;
    const g = Array.from({ length: TH }, () => Array(TW).fill('.'));
    const set = (x, y, c) => { if (x >= 0 && x < TW && y >= 0 && y < TH) g[y][x] = c; };
    const post = (x0, y0, y1) => {
      for (let y = y0; y <= y1; y++) {
        const s = y % 3 === 0 ? 'Q' : 'q';
        set(x0, y, 'o'); set(x0 + 1, y, s); set(x0 + 2, y, s); set(x0 + 3, y, 'o');
      }
    };
    const plat = (x0, x1, y) => {
      for (let x = x0 + 1; x < x1; x++) {
        set(x, y, 'o'); set(x, y + 1, 'c'); set(x, y + 2, 'c'); set(x, y + 3, 'C'); set(x, y + 4, 'o');
      }
      for (let k = 1; k <= 3; k++) { set(x0, y + k, 'o'); set(x1, y + k, 'o'); }
      for (let x = x0 + 2; x < x1 - 1; x += 5) set(x, y + 1, 'L');
    };
    const rim = (x, y, dir) => {
      // yatağın kabarık kenarı
      for (let i = 0; i < 4; i++) set(x + dir * i, y - 2, i === 0 ? '.' : 'o');
      set(x, y - 1, 'o');
      for (let i = 1; i < 4; i++) set(x + dir * i, y - 1, i === 1 ? 'L' : 'c');
      set(x + dir * 4, y - 1, 'o');
      for (let i = 1; i < 4; i++) set(x + dir * i, y, 'c');
    };
    post(6, 42, 56);
    post(27, 24, 56);
    post(2, 9, 37);
    plat(0, 17, 37);
    plat(19, 35, 19);
    plat(0, 21, 5);
    rim(0, 5, 1);
    rim(21, 5, -1);
    plat(0, 35, 55);
    for (let y = 24; y <= 30; y++) set(32, y, 'o');
    ['.ooo.', 'oXhXo', 'oXXXo', 'oXxXo', '.ooo.'].forEach((r, y) => {
      for (let x = 0; x < 5; x++) if (r[x] !== '.') set(30 + x, 31 + y, r[x]);
    });
    return g.map((r) => r.join(''));
  }
  const TREE = buildTree();
  // Raflar: x = oturma noktası, top = rafın üst satırı (sprite pikseli)
  const TREE_PERCHES = [
    { x: 11, top: 37 },
    { x: 27, top: 19 },
    { x: 11, top: 6 },
  ];

  // ---------- Yardımcılar ----------
  function overlay(base, patch, ox, oy) {
    const rows = base.map((r) => r.split(''));
    patch.forEach((pr, y) => {
      for (let x = 0; x < pr.length; x++) {
        const ch = pr[x];
        if (ch === '.') continue;
        const ty = y + oy, tx = x + ox;
        while (rows.length <= ty) rows.push([]);
        while (rows[ty].length <= tx) rows[ty].push('.');
        rows[ty][tx] = ch === '_' ? '.' : ch;
      }
    });
    return rows.map((r) => r.join(''));
  }

  const LICK_A = overlay(SIT_A, [
    '.oo..',
    'owwop',
    'owwo.',
    'owwo.',
    '.owo.',
  ], 4, 8);
  const LICK_B = overlay(SIT_A, [
    '.oo..',
    'owwo.',
    'owwo.',
    'owwo.',
  ], 4, 10);

  // Mama seviyeleri 0..3
  const BOWL_FRAMES = [
    BOWL,
    overlay(BOWL, ['fFffFfFffFfF'], 2, 4),
    overlay(BOWL, ['....fFfF....', '.FffFfFffFf.', 'fFffFfFffFfF'], 2, 2),
    overlay(BOWL, ['....fFFf....', '..fFffFfFf..', '.fFfFffFfFf.', 'FffFfFffFfFf'], 2, 1),
  ];

  // Su kabı: aynı kap, mavi; su seviyeleri 0..3
  const WBOWL = BOWL.map((r) => r.replace(/R/g, 'U').replace(/r/g, 'u').replace(/h/g, 'W'));
  const WBOWL_FRAMES = [
    WBOWL,
    overlay(WBOWL, ['aAAaAAAaAAaA'], 2, 4),
    overlay(WBOWL, ['AAWAAAAAWAAA'], 2, 4),
    overlay(WBOWL, ['.aAAaAAAAaAAa.', 'AAWAAAAAWAAA'], 1, 3),
  ];

  const SCRATCH_A = overlay(overlay(SCRATCH_BASE.map((r) => r.padEnd(20, '.')), ARM_L, 0, 0), ARM_R, 15, 3);
  const SCRATCH_B = overlay(overlay(SCRATCH_BASE.map((r) => r.padEnd(20, '.')), ARM_L, 0, 3), ARM_R, 15, 0);

  function eatFrame(dy) {
    return overlay(BODY_NOHEAD, SIDE_HEAD, 12, dy);
  }

  // name: { frames, ax (yere basma noktası x), front (önden mi), patches }
  const SPRITES = {
    sit:    { frames: [SIT_A, SIT_B], ax: 8, front: true },
    lick:   { frames: [LICK_A, LICK_B], ax: 8, front: true },
    walk:   { frames: ['A', 'B', 'A', 'C'].map((k) => SIDE_TOP.concat(LEGS[k])), ax: 11 },
    jump:   { frames: [SIDE_TOP.concat(LEGS.JUMP)], ax: 11 },
    crouch: { frames: [SIDE_TOP.concat(LEGS.CROUCH)], ax: 11 },
    eat:    { frames: [eatFrame(5), eatFrame(6)], ax: 11 },
    sleep:  { frames: [SLEEP_A, SLEEP_B], ax: 11 },
    dangle: { frames: [DANGLE_A, DANGLE_B], ax: 8, front: true },
    scratch:{ frames: [SCRATCH_A, SCRATCH_B], ax: 10, front: true, px: 2, py: 3 },
    bowl:   { frames: BOWL_FRAMES, ax: 8, item: true },
    water:  { frames: WBOWL_FRAMES, ax: 8, item: true },
    bag:    { frames: [BAG], ax: 6, item: true },
    jug:    { frames: [JUG], ax: 5, item: true },
    basket: { frames: [BASKET], ax: 7, item: true },
    ball:   { frames: [BALL], ax: 3, item: true },
    yarn:   { frames: [YARN], ax: 4, item: true },
    mouse:  { frames: [TOYMOUSE], ax: 5, item: true },
    tree:   { frames: [TREE], ax: 18, item: true },
    heart:  { frames: [HEART], ax: 3, item: true },
    fish:   { frames: [FISH], ax: 4, item: true },
    drop:   { frames: [DROP], ax: 2, item: true },
    spark:  { frames: [SPARK], ax: 2, item: true },
  };

  // Önden kafalarda yanak pembeliği ve açık ağız (miyav) yamaları
  const FRONT_PATCHES = {
    blush: [[2, 8, 'p'], [3, 8, 'p'], [12, 8, 'p'], [13, 8, 'p']],
    meow: [[6, 9, 'o'], [7, 9, 'p'], [8, 9, 'p'], [9, 9, 'o'], [7, 10, 'o'], [8, 10, 'o']],
  };

  // ---------- Paletler ----------
  const PALETTES = {
    tarcin:  { name: 'Turuncu',  o: '#5a2d1a', b: '#f6a04d', d: '#d9732f', w: '#fff3e2', p: '#ff9eb0', g: '#7ccf5e' },
    duman:   { name: 'Gri',      o: '#2d3138', b: '#a3acb6', d: '#7a838e', w: '#edf0f2', p: '#ffa5b5', g: '#f2c94c' },
    gece:    { name: 'Kara',     o: '#121016', b: '#3a3642', d: '#2c2933', w: '#55505f', p: '#ff8fa8', g: '#f5d13b' },
    pamuk:   { name: 'Beyaz',    o: '#6a6270', b: '#fbf8f3', d: '#ebe4da', w: '#ffffff', p: '#ffb0c0', g: '#6fb7ff' },
    smokin:  { name: 'Smokin',   o: '#0e0d12', b: '#2b2833', d: '#211f27', w: '#ffffff', p: '#ff97ad', g: '#9be36b' },
    krem:    { name: 'Krem',     o: '#4a3428', b: '#f2e4c8', d: '#c9a57f', w: '#fbf4e6', p: '#ffa0ae', g: '#5aa9ff' },
    kahve:   { name: 'Tekir',    o: '#3b2414', b: '#9c6b43', d: '#6e4529', w: '#f1dfc6', p: '#ff9fb0', g: '#a8e05f' },
    calico:  { name: 'Üç renk',  o: '#4a3a30', b: '#fdf8f0', d: '#fdf8f0', w: '#ffffff', p: '#ffa5b4', g: '#7ccf5e',
               patches: ['#ee9a45', '#2f2a2e'] },
  };

  const GLOBAL = {
    o: '#3a2630', R: '#ff7b93', r: '#d9536f', h: '#ffe1e8', k: '#6b3b2a',
    f: '#d6964f', F: '#8f5a2b', y: '#f3d9a4', Y: '#d1aa63', B: '#5fa8e6',
    H: '#ff5d8f', s: '#ffe066', w: '#ffffff', p: '#ff9eb0', W: '#ffffff',
    U: '#8ab4ff', u: '#5b86e0', A: '#a5e3ff', a: '#5cbcec',
    X: '#ee3b54', x: '#b3213b', V: '#c08ae6', v: '#8b5cc7', G: '#c3bfca', j: '#9893a3',
    K: '#e2b06a', c: '#f7b9cb', C: '#e48aa7', L: '#ffe3ec', q: '#ecd29d', Q: '#c69b5c',
  };

  const hexCache = {};
  function rgba(hex) {
    if (hexCache[hex]) return hexCache[hex];
    const n = parseInt(hex.slice(1), 16);
    return (hexCache[hex] = [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]);
  }

  function calicoPatch(x, y, pal) {
    const bx = Math.floor((x + 1) / 4), by = Math.floor((y + 2) / 4);
    const v = ((bx * 7 + by * 13) ^ (bx * by * 3)) % 5;
    if (v === 0) return pal.patches[0];
    if (v === 1) return pal.patches[1];
    return null;
  }

  // Göz pikseli: mode = open | closed | happy | wide ; look = -1 | 0 | 1
  function eyeChar(rows, x, y, mode, look) {
    const at = (xx, yy) => (rows[yy] && rows[yy][xx]) === 'E';
    const isTop = !at(x, y - 1);
    const wide = at(x - 1, y) || at(x + 1, y);
    const isLeft = !at(x - 1, y);
    if (mode === 'closed') return isTop ? 'b' : 'o';
    if (mode === 'happy') return isTop ? 'o' : 'b';
    if (!wide) return mode === 'wide' ? 'o' : isTop ? 'o' : 'g';
    if (mode === 'wide' || look === 0) return isTop && isLeft ? 'W' : 'o';
    if (look < 0) return isLeft ? 'o' : 'g';
    return isLeft ? 'g' : 'o';
  }

  // Saf piksel üretimi (DOM'suz). Dönen: { w, h, data: Uint8ClampedArray }
  function renderPixels(name, frame, paletteId, opts) {
    opts = opts || {};
    const sp = SPRITES[name];
    let rows = sp.frames[frame % sp.frames.length];
    if (sp.front && (opts.blush || opts.meow)) {
      const extra = [];
      if (opts.blush) extra.push(...FRONT_PATCHES.blush);
      if (opts.meow) extra.push(...FRONT_PATCHES.meow);
      rows = rows.map((r) => r.split(''));
      const px = sp.px || 0, py = sp.py || 0;
      for (const [x, y, c] of extra) if (rows[y + py][x + px] !== 'E') rows[y + py][x + px] = c;
      rows = rows.map((r) => r.join(''));
    }
    const pal = PALETTES[paletteId] || PALETTES.tarcin;
    const h = rows.length;
    const w = Math.max(...rows.map((r) => r.length));
    const data = new Uint8ClampedArray(w * h * 4);
    const mode = opts.eyes || 'open';
    const look = opts.look == null ? 0 : opts.look;
    for (let y = 0; y < h; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        let ch = row[x];
        if (ch === '.') continue;
        if (ch === 'E') ch = eyeChar(rows, x, y, mode, look);
        let col;
        if (sp.item) col = GLOBAL[ch];
        else if (ch === 'W') col = '#ffffff';
        else if (ch === 'b' && pal.patches) col = calicoPatch(x, y, pal) || pal.b;
        else if ('obdwpg'.includes(ch)) col = pal[ch];
        else col = GLOBAL[ch];
        if (!col) continue;
        const c = rgba(col), i = (y * w + x) * 4;
        data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
      }
    }
    return { w, h, data };
  }

  // Tarayıcı: önbellekli ImageData
  const cache = new Map();
  function imageData(name, frame, paletteId, opts) {
    opts = opts || {};
    const key = [name, frame, paletteId, opts.eyes, opts.look, opts.blush ? 1 : 0, opts.meow ? 1 : 0].join('|');
    let img = cache.get(key);
    if (!img) {
      const px = renderPixels(name, frame, paletteId, opts);
      img = new ImageData(px.data, px.w, px.h);
      cache.set(key, img);
    }
    return img;
  }

  // Ölçeklenmiş tuval (popup önizlemeleri, parçacıklar için)
  function canvas(name, frame, paletteId, opts, scale) {
    const img = imageData(name, frame, paletteId, opts);
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').putImageData(img, 0, 0);
    c.style.width = img.width * (scale || 1) + 'px';
    c.style.height = img.height * (scale || 1) + 'px';
    c.style.imageRendering = 'pixelated';
    return c;
  }

  const api = { SPRITES, PALETTES, TREE_PERCHES, renderPixels, imageData, canvas };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MiyavSprites = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
