const LINK_PREFIX = 'https://perm.lemanapro.ru/product/kraska-lateksnaya-dlya-sten-i-potolkov-dufa-mattlatex-mix-matovaya-baza-1-cvet-belyy-10-l-15055311/?robotint-share=';
const PAGE_SIZE = 120;
const FAVORITES_KEY = 'paint-color-catalog.favorites.v1';
const LINKS_KEY = 'paint-color-catalog.product-links.v1';
const catalogs = { A: null, C: null };
const productLinks = { A: LINK_PREFIX.slice(0, -'?robotint-share='.length), C: '' };
const favorites = new Map();
const grid = document.querySelector('#colorGrid');
const statusBox = document.querySelector('#status');
const paletteFilter = document.querySelector('#paletteFilter');
const searchInput = document.querySelector('#search');
const sortSelect = document.querySelector('#sort');
let colors = [];
let visibleLimit = PAGE_SIZE;
let selectedKey = null;
let activeType = 'all';
let currentView = 'all';
let sortDirection = 1;
let manualReference = null;
let paletteOptions = [];

function setStatus(message, kind = '') {
  statusBox.textContent = message;
  statusBox.className = `status${kind ? ` ${kind}` : ''}`;
}
function colorKey(color) { return `${color.baseType}\u0000${color.paletteId}\u0000${color.id}`; }
function colorUrl(color) {
  const base = (productLinks[color.baseType] || '').trim();
  if (!base) return '';
  if (base.includes('{id}')) return base.replaceAll('{id}', encodeURIComponent(color.id));
  try {
    const url = new URL(base);
    url.searchParams.set('robotint-share', color.id);
    return url.toString();
  } catch { return ''; }
}
function parseColorValue(raw) {
  const text = raw.trim();
  let match = text.match(/^#?([\da-f]{3}|[\da-f]{6})$/i);
  if (match) {
    let hex = match[1];
    if (hex.length === 3) hex = [...hex].map(char => char + char).join('');
    return `#${hex.toUpperCase()}`;
  }
  match = text.match(/^rgba?\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)$/i)
    || text.match(/^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/);
  if (match) {
    const channels = match.slice(1, 4).map(Number);
    if (channels.every(value => value <= 255)) return `#${channels.map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  }
  return null;
}
function rgbChannels(hex) {
  const value = hex.replace('#', '');
  return [0, 2, 4].map(index => parseInt(value.slice(index, index + 2), 16));
}
function linearChannel(value) {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}
function relativeBrightness(hex) {
  const [r, g, b] = rgbChannels(hex).map(linearChannel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function hsl(hex) {
  let [r, g, b] = rgbChannels(hex).map(value => value / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let hue = 0, saturation = 0;
  const lightness = (max + min) / 2;
  if (delta) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue = (hue * 60 + 360) % 360;
  }
  return { hue, saturation, lightness };
}
function oklab(hex) {
  const [r, g, b] = rgbChannels(hex).map(linearChannel);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  ];
}
function colorDistance(a, b) {
  const x = oklab(a), y = oklab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}
function normalizeCatalog(input, baseType) {
  let sourcePalettes;
  if (Array.isArray(input)) {
    const groups = new Map();
    for (const color of input) {
      const name = String(color.paletteName || 'Без палитры').trim();
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(color);
    }
    sourcePalettes = [...groups.entries()].map(([name, paletteColors]) => ({ id: name, name, colors: paletteColors }));
  } else if (input && Array.isArray(input.palettes)) sourcePalettes = input.palettes;
  else throw new Error('Формат каталога не распознан: нужен объект с массивом palettes.');

  const normalizedPalettes = [];
  const normalizedColors = [];
  for (const source of sourcePalettes) {
    const paletteName = String(source.name || source.paletteName || '').trim();
    if (!paletteName || !Array.isArray(source.colors)) continue;
    const paletteId = String(source.id ?? paletteName);
    const paletteColors = [];
    for (const item of source.colors) {
      const id = String(item.id ?? '').trim();
      const name = String(item.name ?? '').trim();
      const hex = String(item.hex ?? '').trim().toUpperCase();
      if (!id || !name || !/^#[\da-f]{6}$/i.test(hex)) continue;
      paletteColors.push({ id, name, hex });
      normalizedColors.push({ id, name, hex, paletteId, paletteName, baseType });
    }
    normalizedPalettes.push({ id: paletteId, name: paletteName, colors: paletteColors });
  }
  return { baseType, palettes: normalizedPalettes, colors: normalizedColors, complete: input?.complete !== false, errors: input?.errors || [] };
}
function persistFavorites() {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites.values()])); }
  catch { setStatus('Избранное доступно в этой сессии, но браузер не сохранил его автоматически. Скачайте JSON для резервной копии.', 'error'); }
  updateFavoriteCount();
}
function loadStoredFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    const list = Array.isArray(saved) ? saved : saved.favorites;
    if (Array.isArray(list)) list.forEach(addFavoriteRecord);
  } catch { /* Local-file origins may not provide persistent storage. */ }
}
function addFavoriteRecord(item) {
  if (!item || !['A', 'C'].includes(item.baseType) || item.id == null || !item.name || !item.hex) return;
  const record = {
    baseType: item.baseType,
    paletteId: String(item.paletteId ?? item.paletteName ?? ''),
    paletteName: String(item.paletteName ?? 'Без палитры'),
    id: String(item.id),
    name: String(item.name),
    hex: String(item.hex).toUpperCase()
  };
  if (!/^#[\da-f]{6}$/i.test(record.hex)) return;
  favorites.set(colorKey(record), record);
}
function updateFavoriteCount() {
  document.querySelector('#favoriteCount').textContent = favorites.size.toLocaleString('ru-RU');
}
function getSourceList() {
  if (currentView === 'favorites') return [...favorites.values()];
  return colors;
}
function populatePaletteFilter() {
  const currentValue = paletteFilter.value;
  const source = getSourceList().filter(color => activeType === 'all' || color.baseType === activeType);
  const unique = new Map();
  source.forEach(color => unique.set(`${color.baseType}|${color.paletteId}`, { type: color.baseType, id: color.paletteId, name: color.paletteName }));
  paletteOptions = [...unique.values()].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name, 'ru'));
  paletteFilter.replaceChildren(new Option('Все палитры', ''));
  paletteOptions.forEach(palette => paletteFilter.add(new Option(`[${palette.type}] ${palette.name}`, `${palette.type}|${palette.id}`)));
  if ([...paletteFilter.options].some(option => option.value === currentValue)) paletteFilter.value = currentValue;
}
function compareColors(a, b) {
  const multiplier = sortDirection;
  switch (sortSelect.value) {
    case 'brightness': return (relativeBrightness(a.hex) - relativeBrightness(b.hex)) * multiplier;
    case 'hue': return (hsl(a.hex).hue - hsl(b.hex).hue) * multiplier;
    case 'saturation': return (hsl(a.hex).saturation - hsl(b.hex).saturation) * multiplier;
    case 'name': return a.name.localeCompare(b.name, 'ru') * multiplier;
    case 'palette': return (a.paletteName.localeCompare(b.paletteName, 'ru') || a.name.localeCompare(b.name, 'ru')) * multiplier;
    case 'similarity':
      if (manualReference) return (colorDistance(a.hex, manualReference) - colorDistance(b.hex, manualReference)) * multiplier;
      return 0;
    default: {
      const x = rgbChannels(a.hex), y = rgbChannels(b.hex);
      return ((x[0] - y[0]) || (x[1] - y[1]) || (x[2] - y[2])) * multiplier;
    }
  }
}
function matchingColors() {
  const paletteValue = paletteFilter.value;
  const query = searchInput.value.trim().toLocaleLowerCase('ru');
  return getSourceList().filter(color => {
    if (activeType !== 'all' && color.baseType !== activeType) return false;
    if (paletteValue && `${color.baseType}|${color.paletteId}` !== paletteValue) return false;
    if (query && !`${color.name} ${color.hex} ${color.id} ${color.paletteName}`.toLocaleLowerCase('ru').includes(query)) return false;
    return true;
  }).sort(compareColors);
}
function getSimilar(color) {
  return colors.filter(other => other.baseType === color.baseType && colorKey(other) !== colorKey(color))
    .map(other => ({ color: other, distance: colorDistance(color.hex, other.hex) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 10)
    .map(item => item.color);
}
function toggleFavorite(color) {
  const key = colorKey(color);
  if (favorites.has(key)) favorites.delete(key);
  else addFavoriteRecord(color);
  persistFavorites();
  if (currentView === 'favorites') populatePaletteFilter();
  render();
}
function makeCard(color) {
  const card = document.createElement('article');
  const key = colorKey(color);
  card.className = `color-card${selectedKey === key ? ' selected' : ''}`;
  card.tabIndex = 0;
  card.setAttribute('aria-label', `${color.name}, ${color.hex}, палитра ${color.paletteName}, основа ${color.baseType}. Выбрать, чтобы показать похожие цвета.`);
  const swatch = document.createElement('div');
  swatch.className = 'swatch';
  swatch.style.backgroundColor = color.hex;
  const info = document.createElement('div');
  info.className = 'card-info';
  const favoriteButton = document.createElement('button');
  favoriteButton.type = 'button';
  favoriteButton.className = `favorite-toggle${favorites.has(key) ? ' active' : ''}`;
  favoriteButton.textContent = favorites.has(key) ? '★' : '☆';
  favoriteButton.title = favorites.has(key) ? 'Убрать из избранного' : 'Сохранить в избранном';
  favoriteButton.setAttribute('aria-label', favoriteButton.title);
  favoriteButton.addEventListener('click', event => { event.stopPropagation(); toggleFavorite(color); });
  const name = document.createElement('div');
  name.className = 'color-name';
  name.textContent = color.name;
  name.append(favoriteButton);
  const palette = document.createElement('div');
  palette.className = 'palette-name';
  palette.textContent = color.paletteName;
  const badge = document.createElement('span');
  badge.className = 'type-badge';
  badge.textContent = `ОСНОВА ${color.baseType}`;
  const code = document.createElement('div');
  code.className = 'color-code';
  code.textContent = `${color.hex} · ID ${color.id}`;
  const link = document.createElement('a');
  link.className = 'open-link';
  link.textContent = 'Открыть товар ↗';
  const href = colorUrl(color);
  if (href) {
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  } else {
    link.classList.add('disabled');
    link.href = '#';
    link.title = `Добавьте ссылку на краску с основой ${color.baseType} в блоке «Ссылки на краску».`;
  }
  link.addEventListener('click', event => {
    event.stopPropagation();
    if (!href) { event.preventDefault(); setStatus(`Добавьте ссылку на краску с основой ${color.baseType}.`,'error'); }
  });
  info.append(name, palette, badge, code, link);
  card.append(swatch, info);

  if (selectedKey === key) {
    const similar = document.createElement('div');
    similar.className = 'similar';
    const label = document.createElement('div');
    label.className = 'similar-label';
    label.textContent = `Ближайшие оттенки для основы ${color.baseType}`;
    const list = document.createElement('div');
    list.className = 'similar-list';
    getSimilar(color).forEach(other => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'similar-item';
      item.title = `${other.name} · ${other.hex}`;
      const chip = document.createElement('span');
      chip.className = 'similar-chip';
      chip.style.backgroundColor = other.hex;
      const chipName = document.createElement('span');
      chipName.className = 'similar-name';
      chipName.textContent = other.name;
      item.append(chip, chipName);
      item.addEventListener('click', event => {
        event.stopPropagation();
        const target = colorUrl(other);
        if (target) window.open(target, '_blank', 'noopener,noreferrer');
        else setStatus(`Добавьте ссылку на краску с основой ${other.baseType}.`, 'error');
      });
      list.append(item);
    });
    similar.append(label, list);
    card.append(similar);
  }

  card.addEventListener('click', () => { selectedKey = selectedKey === key ? null : key; render(); });
  card.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      if (event.target.closest('a,button')) return;
      event.preventDefault();
      selectedKey = selectedKey === key ? null : key;
      render();
    }
  });
  return card;
}
function render() {
  const matches = matchingColors();
  const shown = matches.slice(0, visibleLimit);
  grid.replaceChildren();
  if (!shown.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = currentView === 'favorites' ? 'В этом списке пока нет избранных цветов.' : 'Цвета по этому запросу не найдены.';
    grid.append(empty);
  } else {
    const fragment = document.createDocumentFragment();
    shown.forEach(color => fragment.append(makeCard(color)));
    grid.append(fragment);
  }
  const favoriteCount = document.querySelector('#favoriteCount');
  favoriteCount.textContent = favorites.size.toLocaleString('ru-RU');
  document.querySelector('#summary').textContent = `${colors.length.toLocaleString('ru-RU')} цветов · A: ${(catalogs.A?.colors.length || 0).toLocaleString('ru-RU')} · C: ${(catalogs.C?.colors.length || 0).toLocaleString('ru-RU')}`;
  document.querySelector('#resultCount').textContent = `Показано ${shown.length.toLocaleString('ru-RU')} из ${matches.length.toLocaleString('ru-RU')}`;
  document.querySelector('#showMore').hidden = shown.length >= matches.length;
  document.querySelector('#showMore').textContent = `Показать ещё ${Math.min(PAGE_SIZE, matches.length - shown.length).toLocaleString('ru-RU')}`;
  document.querySelector('#favoriteTools').hidden = currentView !== 'favorites';
  document.querySelector('#openFavorites').hidden = currentView !== 'favorites' || matches.length === 0;
  document.querySelector('#viewAll').classList.toggle('active', currentView === 'all');
  document.querySelector('#viewFavorites').classList.toggle('active', currentView === 'favorites');
  document.querySelector('#sortDirection').textContent = sortDirection === 1 ? 'По возрастанию ↑' : 'По убыванию ↓';
}
function switchType(type) {
  activeType = type;
  document.querySelectorAll('#typeTabs [data-type]').forEach(button => button.classList.toggle('active', button.dataset.type === type));
  paletteFilter.value = '';
  selectedKey = null;
  visibleLimit = PAGE_SIZE;
  populatePaletteFilter();
  render();
}
function switchView(view) {
  currentView = view;
  selectedKey = null;
  visibleLimit = PAGE_SIZE;
  paletteFilter.value = '';
  populatePaletteFilter();
  render();
}
function loadCatalog(type, data, label) {
  catalogs[type] = normalizeCatalog(data, type);
  for (const control of [paletteFilter, searchInput, sortSelect, document.querySelector('#sortDirection'), document.querySelector('#findSimilar'), document.querySelector('#clearSimilar')]) control.disabled = false;
  refreshStatusWithLabel(label);
  rebuildColors();
}
function refreshStatusWithLabel(label) {
  if (label) statusBox.dataset.lastLoad = label;
}
function rebuildColors() {
  colors = ['A', 'C'].flatMap(type => catalogs[type]?.colors || []);
  populatePaletteFilter();
  render();
  const counts = ['A', 'C'].map(type => `${type}: ${(catalogs[type]?.colors.length || 0).toLocaleString('ru-RU')}`).join(' · ');
  const incomplete = ['A', 'C'].filter(type => catalogs[type] && !catalogs[type].complete && (catalogs[type].palettes.length || catalogs[type].errors.length));
  const empty = ['A', 'C'].filter(type => !catalogs[type] || catalogs[type].colors.length === 0);
  let message = `${statusBox.dataset.lastLoad ? `${statusBox.dataset.lastLoad} · ` : ''}${counts}`;
  if (empty.length) message += ` · нет данных для основы ${empty.join(' и ')}`;
  if (incomplete.length) message += ` · неполные каталоги: ${incomplete.join(', ')}`;
  setStatus(message, incomplete.length ? 'error' : (colors.length ? 'success' : ''));
}
async function loadLocalFile(type, file) {
  try { loadCatalog(type, JSON.parse(await file.text()), `Загружен файл ${file.name}`); }
  catch (error) { setStatus(`Не удалось загрузить каталог ${type}: ${error.message}`, 'error'); }
}
async function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportFavoritesJson() {
  const data = { schemaVersion: 1, exportedAt: new Date().toISOString(), favorites: [...favorites.values()] };
  downloadFile('izbrannoe.json', JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
}
function exportFavoritesText() {
  const lines = [...favorites.values()].map(item => `[${item.baseType}] ${item.paletteName} — ${item.name} — ${item.hex} — ID ${item.id}`);
  downloadFile('izbrannoe.txt', `\uFEFF${lines.join('\r\n')}`, 'text/plain;charset=utf-8');
}
function updateLinkFields() {
  document.querySelector('#linkA').value = productLinks.A;
  document.querySelector('#linkC').value = productLinks.C;
}
function loadStoredLinks() {
  try {
    const stored = JSON.parse(localStorage.getItem(LINKS_KEY) || '{}');
    if (typeof stored.A === 'string') productLinks.A = stored.A;
    if (typeof stored.C === 'string') productLinks.C = stored.C;
  } catch { /* Browser storage may be unavailable on file:// pages. */ }
  updateLinkFields();
}

loadStoredFavorites();
loadStoredLinks();
updateFavoriteCount();
document.querySelector('#loadAButton').addEventListener('click', () => document.querySelector('#catalogAFile').click());
document.querySelector('#loadCButton').addEventListener('click', () => document.querySelector('#catalogCFile').click());
document.querySelector('#catalogAFile').addEventListener('change', event => { if (event.target.files[0]) loadLocalFile('A', event.target.files[0]); event.target.value = ''; });
document.querySelector('#catalogCFile').addEventListener('change', event => { if (event.target.files[0]) loadLocalFile('C', event.target.files[0]); event.target.value = ''; });
document.querySelectorAll('#typeTabs [data-type]').forEach(button => button.addEventListener('click', () => switchType(button.dataset.type)));
document.querySelector('#viewAll').addEventListener('click', () => switchView('all'));
document.querySelector('#viewFavorites').addEventListener('click', () => switchView('favorites'));
paletteFilter.addEventListener('change', () => { visibleLimit = PAGE_SIZE; selectedKey = null; render(); });
searchInput.addEventListener('input', () => { visibleLimit = PAGE_SIZE; selectedKey = null; render(); });
sortSelect.addEventListener('change', () => { visibleLimit = PAGE_SIZE; render(); });
document.querySelector('#sortDirection').addEventListener('click', () => { sortDirection *= -1; render(); });
document.querySelector('#showMore').addEventListener('click', () => { visibleLimit += PAGE_SIZE; render(); });
document.querySelector('#saveLinks').addEventListener('click', () => {
  const a = document.querySelector('#linkA').value.trim();
  const c = document.querySelector('#linkC').value.trim();
  for (const [type, value] of [['A', a], ['C', c]]) {
    if (value) { try { new URL(value); } catch { setStatus(`Ссылка для основы ${type} выглядит некорректно.`, 'error'); return; } }
  }
  productLinks.A = a;
  productLinks.C = c;
  try { localStorage.setItem(LINKS_KEY, JSON.stringify(productLinks)); } catch { /* Link settings remain active for this page session. */ }
  setStatus('Ссылки сохранены в этом браузере. Для каждого цвета ID будет добавлен в параметр robotint-share.', 'success');
  render();
});
document.querySelector('#referencePicker').addEventListener('input', event => { document.querySelector('#referenceText').value = event.target.value.toUpperCase(); });
document.querySelector('#findSimilar').addEventListener('click', () => {
  const hex = parseColorValue(document.querySelector('#referenceText').value);
  if (!hex) { setStatus('Введите HEX (#RRGGBB) или RGB, например rgb(255, 0, 170).', 'error'); return; }
  manualReference = hex;
  document.querySelector('#referenceText').value = hex;
  document.querySelector('#referencePicker').value = hex;
  sortSelect.value = 'similarity';
  sortDirection = 1;
  visibleLimit = PAGE_SIZE;
  setStatus(`Показываю цвета, ближайшие к ${hex}, по расстоянию в OKLab.`, 'success');
  render();
});
document.querySelector('#clearSimilar').addEventListener('click', () => {
  manualReference = null;
  sortSelect.value = 'rgb';
  sortDirection = 1;
  visibleLimit = PAGE_SIZE;
  setStatus('Поиск похожего цвета сброшен.');
  render();
});
document.querySelector('#downloadFavoritesJson').addEventListener('click', exportFavoritesJson);
document.querySelector('#downloadFavoritesTxt').addEventListener('click', exportFavoritesText);
document.querySelector('#importFavoritesButton').addEventListener('click', () => document.querySelector('#importFavoritesFile').click());
document.querySelector('#importFavoritesFile').addEventListener('change', async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const list = Array.isArray(parsed) ? parsed : parsed.favorites;
    if (!Array.isArray(list)) throw new Error('Ожидается JSON-список избранных цветов.');
    list.forEach(addFavoriteRecord);
    persistFavorites();
    populatePaletteFilter();
    render();
    setStatus(`Список «${file.name}» добавлен в избранное. Записей: ${list.length}.`, 'success');
  } catch (error) { setStatus(`Не удалось загрузить избранное: ${error.message}`, 'error'); }
});
document.querySelector('#openFavorites').addEventListener('click', () => {
  const matches = matchingColors();
  if (!matches.length) return;
  if (!window.confirm(`Открыть ${matches.length.toLocaleString('ru-RU')} ссылок из избранного в новых вкладках?`)) return;
  matches.forEach(color => { const url = colorUrl(color); if (url) window.open(url, '_blank', 'noopener,noreferrer'); });
});

if (location.protocol === 'file:') {
  catalogs.A = null;
  catalogs.C = null;
  setStatus('Открыто локально. Загрузите JSON для основы A и/или C кнопками сверху; сервер не нужен.');
} else {
  Promise.all(['A', 'C'].map(async type => {
    const file = `catalog-type-${type.toLowerCase()}.json`;
    try {
      const response = await fetch(`./${file}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      loadCatalog(type, await response.json(), `Загружен ${file}`);
    } catch (error) {
      refreshStatusWithLabel(`Не удалось загрузить ${file}: ${error.message}`);
      rebuildColors();
    }
  })).then(() => {
    if (!catalogs.A && !catalogs.C) setStatus('Каталоги не загрузились. Выберите JSON-файлы вручную.', 'error');
  });
}
