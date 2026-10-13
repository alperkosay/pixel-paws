// İlk kurulumda bir kedi ve varsayılan ayarlar.
chrome.runtime.onInstalled.addListener(async () => {
  const all = await chrome.storage.local.get(['cats', 'settings', 'bowl', 'water']);
  const patch = {};
  if (!all.settings) patch.settings = { enabled: true, scale: 3, disabledSites: [], tree: true };
  if (!all.cats) {
    const id = 'c' + Date.now().toString(36);
    patch.cats = [{ id, name: 'Tarçın', palette: 'tarcin', adoptedAt: Date.now() }];
    patch['stat_' + id] = { love: 0, fullness: 70, fullnessAt: Date.now(), water: 70, waterAt: Date.now() };
  }
  if (all.bowl == null) patch.bowl = 1;
  if (all.water == null) patch.water = 1;
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
});
