(() => {
  'use strict';
  const SP = globalThis.MiyavSprites;
  const store = chrome.storage.local;
  const MAX_CATS = 10;
  const HUNGER_PER_MIN = 0.55;
  const THIRST_PER_MIN = 0.45;
  const NAMES = ['Tarçın', 'Pamuk', 'Duman', 'Boncuk', 'Zeytin', 'Fıstık', 'Mırmır', 'Limon', 'Karamel', 'Paşa',
    'Minnoş', 'Şeker', 'Bulut', 'Köpük', 'Lokum', 'Simit', 'Ponçik', 'Gece', 'Kurabiye', 'Mia', 'Tombi', 'Pofuduk'];

  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  let state = { settings: { enabled: true, scale: 3, disabledSites: [], tree: true }, cats: [], stats: {}, bowl: 0 };
  let chosenPalette = 'tarcin';
  let host = null;

  // ---------- Çizim ----------
  function drawCat(cv, palette, scale, opts) {
    const img = SP.imageData('sit', opts.frame || 0, palette, opts);
    cv.width = img.width; cv.height = img.height;
    cv.getContext('2d').putImageData(img, 0, 0);
    cv.style.width = img.width * scale + 'px';
    cv.style.height = img.height * scale + 'px';
  }

  drawCat($('logo'), 'tarcin', 2, { eyes: 'happy', blush: true });

  // ---------- Yardımcılar ----------
  function fullness(id) {
    const s = state.stats[id];
    if (!s) return 80;
    return clamp(s.fullness - ((Date.now() - s.fullnessAt) / 60000) * HUNGER_PER_MIN, 0, 100);
  }
  function waterLevel(id) {
    const s = state.stats[id];
    if (!s || s.water == null) return 80;
    return clamp(s.water - ((Date.now() - s.waterAt) / 60000) * THIRST_PER_MIN, 0, 100);
  }
  function loveLabel(l) {
    if (l < 8) return 'Çekingen';
    if (l < 30) return 'Arkadaş';
    if (l < 80) return 'Can dostu';
    return 'Ruh ikizi';
  }
  function hearts(l) {
    const n = clamp(Math.floor(l / 16) + 1, 1, 5);
    return '♥'.repeat(n) + '♡'.repeat(5 - n);
  }
  function randomName() {
    const used = new Set(state.cats.map((c) => c.name));
    const free = NAMES.filter((n) => !used.has(n));
    const list = free.length ? free : NAMES;
    return list[Math.floor(Math.random() * list.length)];
  }
  function command(type, extra) {
    store.set({ command: Object.assign({ type, at: Date.now(), n: Math.random() }, extra) });
  }

  // ---------- Kedi listesi ----------
  const anim = [];
  function renderList() {
    const list = $('list');
    list.textContent = '';
    anim.length = 0;
    $('count').textContent = `(${state.cats.length}/${MAX_CATS})`;
    $('empty').hidden = state.cats.length > 0;
    $('adopt').disabled = state.cats.length >= MAX_CATS;

    for (const cat of state.cats) {
      const card = document.createElement('div');
      card.className = 'card';

      const cv = document.createElement('canvas');
      drawCat(cv, cat.palette, 3, {});
      anim.push({ cv, cat, frame: 0 });

      const info = document.createElement('div');
      info.className = 'info';
      const name = document.createElement('input');
      name.className = 'name';
      name.value = cat.name;
      name.maxLength = 16;
      name.spellcheck = false;
      name.title = 'İsmi değiştirmek için tıkla';
      name.addEventListener('change', () => {
        const v = name.value.trim() || cat.name;
        name.value = v;
        store.set({ cats: state.cats.map((c) => (c.id === cat.id ? { ...c, name: v } : c)) });
      });
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });

      const love = state.stats[cat.id] ? state.stats[cat.id].love : 0;
      const loveRow = document.createElement('div');
      loveRow.className = 'meta';
      loveRow.innerHTML = `<span class="hearts"></span><span></span>`;
      loveRow.children[0].textContent = hearts(love);
      loveRow.children[1].textContent = loveLabel(love);

      const f = fullness(cat.id), wv = waterLevel(cat.id);
      const mkBar = (val, cls, title) => {
        const bar = document.createElement('div');
        bar.className = 'bar ' + cls + (val < 30 ? ' low' : val < 60 ? ' mid' : '');
        bar.title = title;
        const fill = document.createElement('i');
        fill.style.width = val + '%';
        bar.appendChild(fill);
        return bar;
      };
      const statusRow = document.createElement('div');
      statusRow.className = 'meta';
      statusRow.innerHTML = '<span></span><span></span>';
      statusRow.children[0].textContent = f < 30 ? 'Acıktı! 🐟' : wv < 30 ? 'Susadı! 💧' : f < 60 ? 'İdare eder' : 'Mutlu';
      statusRow.children[1].textContent = `🐟%${Math.round(f)} 💧%${Math.round(wv)}`;

      info.append(name, loveRow,
        mkBar(f, 'food', `Tokluk: %${Math.round(f)}`),
        mkBar(wv, 'water', `Su: %${Math.round(wv)}`),
        statusRow);

      const tools = document.createElement('div');
      tools.className = 'tools';
      const pounce = document.createElement('button');
      pounce.className = 'btn small';
      pounce.textContent = '⚡';
      pounce.title = `${cat.name} fareye pusu kursun`;
      pounce.addEventListener('click', () => command('ambush', { id: cat.id }));
      const del = document.createElement('button');
      del.className = 'btn small danger';
      del.textContent = '✕';
      del.title = 'Sahiplendir (kaldır)';
      del.addEventListener('click', () => {
        if (!del.dataset.sure) {
          del.dataset.sure = '1';
          del.textContent = 'emin?';
          setTimeout(() => { del.dataset.sure = ''; del.textContent = '✕'; }, 2500);
          return;
        }
        store.remove('stat_' + cat.id);
        store.set({ cats: state.cats.filter((c) => c.id !== cat.id) });
      });
      tools.append(pounce, del);

      card.append(cv, info, tools);
      list.appendChild(card);
    }
  }

  // Kartlardaki kediler kuyruk sallasın, göz kırpsın
  setInterval(() => {
    for (const a of anim) {
      if (Math.random() < 0.5) a.frame ^= 1;
      const blink = Math.random() < 0.15;
      drawCat(a.cv, a.cat.palette, 3, { frame: a.frame, eyes: blink ? 'closed' : 'open', look: [-1, 0, 1][Math.floor(Math.random() * 3)] });
    }
  }, 650);

  // ---------- Sahiplenme ----------
  function renderSwatches() {
    const box = $('swatches');
    box.textContent = '';
    for (const [id, pal] of Object.entries(SP.PALETTES)) {
      const b = document.createElement('button');
      b.className = 'swatch' + (id === chosenPalette ? ' on' : '');
      const cv = document.createElement('canvas');
      drawCat(cv, id, 2, { eyes: id === chosenPalette ? 'happy' : 'open' });
      const label = document.createElement('span');
      label.textContent = pal.name;
      b.append(cv, label);
      b.addEventListener('click', () => { chosenPalette = id; renderSwatches(); });
      box.appendChild(b);
    }
  }

  $('dice').addEventListener('click', () => { $('newName').value = randomName(); });
  $('newName').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('adopt').click(); });
  $('adopt').addEventListener('click', async () => {
    if (state.cats.length >= MAX_CATS) return;
    const id = 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const name = $('newName').value.trim() || randomName();
    await store.set({
      cats: state.cats.concat([{ id, name, palette: chosenPalette, adoptedAt: Date.now() }]),
      ['stat_' + id]: { love: 0, fullness: 60, fullnessAt: Date.now(), water: 60, waterAt: Date.now() },
    });
    $('newName').value = randomName();
  });

  // ---------- Üst butonlar ve ayarlar ----------
  $('feed').addEventListener('click', () => {
    store.set({ bowl: 3 });
    $('feed').textContent = '✔ Doldu';
    setTimeout(() => { $('feed').textContent = '🐟 Mama'; }, 1400);
  });
  $('waterBtn').addEventListener('click', () => {
    store.set({ water: 3 });
    $('waterBtn').textContent = '✔ Doldu';
    setTimeout(() => { $('waterBtn').textContent = '💧 Su'; }, 1400);
  });
  $('tree').addEventListener('change', (e) => saveSettings({ tree: e.target.checked }));
  $('summon').addEventListener('click', () => command('summon'));
  $('ambush').addEventListener('click', () => command('ambush'));

  function saveSettings(patch) {
    store.set({ settings: Object.assign({}, state.settings, patch) });
  }
  $('enabled').addEventListener('change', (e) => saveSettings({ enabled: e.target.checked }));
  $('scale').addEventListener('input', (e) => saveSettings({ scale: Number(e.target.value) }));
  $('siteOff').addEventListener('change', (e) => {
    if (!host) return;
    const set = new Set(state.settings.disabledSites || []);
    e.target.checked ? set.add(host) : set.delete(host);
    saveSettings({ disabledSites: [...set] });
  });

  function renderSettings() {
    const s = state.settings;
    $('enabled').checked = s.enabled !== false;
    $('scale').value = s.scale || 3;
    $('tree').checked = s.tree !== false;
    $('siteOff').checked = !!host && (s.disabledSites || []).includes(host);
    $('siteOff').disabled = !host;
    $('siteLabel').textContent = host ? `${host} sitesinde gizle` : 'Bu sayfada kediler çalışmaz';
    const off = s.enabled === false;
    for (const id of ['feed', 'waterBtn', 'summon', 'ambush']) $(id).disabled = off || !state.cats.length;
  }

  // ---------- Yükleme ----------
  async function load() {
    const all = await store.get(null);
    state.settings = Object.assign({ enabled: true, scale: 3, disabledSites: [], tree: true }, all.settings || {});
    state.cats = all.cats || [];
    state.bowl = all.bowl || 0;
    state.stats = {};
    for (const k in all) if (k.startsWith('stat_')) state.stats[k.slice(5)] = all[k];
    renderList();
    renderSettings();
  }

  chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    try {
      const u = new URL(tab.url);
      if (u.protocol === 'http:' || u.protocol === 'https:') host = u.hostname;
    } catch (_) {}
    renderSettings();
  }).catch(() => {});

  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    // Yalnızca isim kutusuna yazılırken listeyi yeniden çizme
    if (document.activeElement && document.activeElement.classList.contains('name') && !ch.cats) return;
    if (Object.keys(ch).every((k) => k === 'command')) return;
    load();
  });

  $('newName').value = randomName();
  renderSwatches();
  load();
})();
