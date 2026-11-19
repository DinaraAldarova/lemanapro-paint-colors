const LINK_PREFIX = 'https://perm.lemanapro.ru/product/kraska-lateksnaya-dlya-sten-i-potolkov-dufa-mattlatex-mix-matovaya-baza-1-cvet-belyy-10-l-15055311/?robotint-share=';
const groups = document.querySelector('#groups');
const sortSelect = document.querySelector('#sort');
let colors = [];
let selectedId = null;

function channels(hex) {
  const value = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16));
}
function rgbDistance(a, b) {
  const x = channels(a), y = channels(b);
  return Math.sqrt((x[0]-y[0])**2 + (x[1]-y[1])**2 + (x[2]-y[2])**2);
}
function colorUrl(color) { return LINK_PREFIX + encodeURIComponent(color.id); }
function openColor(color) { window.open(colorUrl(color), '_blank', 'noopener,noreferrer'); }
function sortedColors() {
  const copy = [...colors];
  if (sortSelect.value === 'name') return copy.sort((a,b) => a.name.localeCompare(b.name, 'ru'));
  if (sortSelect.value === 'palette') return copy.sort((a,b) => a.paletteName.localeCompare(b.paletteName, 'ru') || a.name.localeCompare(b.name, 'ru'));
  return copy.sort((a,b) => {
    const x=channels(a.hex), y=channels(b.hex);
    return x[0]-y[0] || x[1]-y[1] || x[2]-y[2];
  });
}
function render() {
  const ordered = sortedColors();
  document.querySelector('#summary').textContent = `${colors.length} ${plural(colors.length)} · ${new Set(colors.map(c => c.paletteName)).size} ${palettePlural(new Set(colors.map(c => c.paletteName)).size)}`;
  const byPalette = new Map();
  for (const color of ordered) {
    if (!byPalette.has(color.paletteName)) byPalette.set(color.paletteName, []);
    byPalette.get(color.paletteName).push(color);
  }
  groups.innerHTML = '';
  for (const [palette, items] of byPalette) {
    const section = document.createElement('section');
    section.innerHTML = `<div class="palette-heading"><h2></h2><span>${items.length} ${plural(items.length)}</span></div><div class="color-grid"></div>`;
    section.querySelector('h2').textContent = palette;
    const grid = section.querySelector('.color-grid');
    items.forEach(color => {
      const card = document.createElement('article');
      card.className = `color-card${selectedId === color.id ? ' selected' : ''}`;
      card.tabIndex = 0;
      card.setAttribute('role','button');
      card.setAttribute('aria-label', `${color.name}, ${color.hex}. Нажмите, чтобы открыть страницу товара`);
      const nearest = colors.filter(c => c.id !== color.id).sort((a,b) => rgbDistance(color.hex,a.hex)-rgbDistance(color.hex,b.hex)).slice(0,3);
      card.innerHTML = `<div class="swatch" style="background:${color.hex}"></div><div class="card-info"><div class="color-name"></div><div class="color-code"></div><a class="open-link" target="_blank" rel="noopener noreferrer">Открыть страницу товара ↗</a></div><div class="similar"><div class="similar-label">Похожие цвета</div><div class="similar-list"></div></div>`;
      card.querySelector('.color-name').textContent = color.name;
      card.querySelector('.color-code').textContent = `${color.hex} · ID ${color.id}`;
      const link = card.querySelector('.open-link');
      link.href = colorUrl(color);
      link.addEventListener('click', event => event.stopPropagation());
      nearest.forEach(c => {
        const chip = document.createElement('button');
        chip.className = 'similar-chip'; chip.style.background = c.hex; chip.title = `${c.name} · ${c.hex}`;
        chip.setAttribute('aria-label', `Открыть ${c.name}`);
        chip.addEventListener('click', event => { event.stopPropagation(); openColor(c); });
        card.querySelector('.similar-list').append(chip);
      });
      card.addEventListener('click', () => {
        selectedId = selectedId === color.id ? null : color.id;
        render();
      });
      card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); card.click(); } });
      grid.append(card);
    });
    groups.append(section);
  }
  if (!colors.length) groups.innerHTML = '<div class="empty">Пока нет цветов. Добавьте записи в colors.json.</div>';
}
function plural(n) { return n % 10 === 1 && n % 100 !== 11 ? 'цвет' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'цвета' : 'цветов'; }
function palettePlural(n) { return n % 10 === 1 && n % 100 !== 11 ? 'палитра' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'палитры' : 'палитр'; }

sortSelect.addEventListener('change', render);
document.querySelector('#openAll').addEventListener('click', () => {
  colors.forEach(color => window.open(colorUrl(color), '_blank', 'noopener,noreferrer'));
});
fetch('./colors.json').then(r => { if (!r.ok) throw new Error('Не удалось загрузить colors.json'); return r.json(); }).then(data => {
  colors = data.map(c => ({...c, hex: c.hex.toUpperCase()})); render();
}).catch(() => { groups.innerHTML = '<div class="empty">Не удалось загрузить colors.json. Откройте страницу через локальный веб-сервер.</div>'; });
