// Run in DevTools Console on perm.lemanapro.ru.
// One SECRET → init palette list → get-colors per palette → one catalog JSON.
(() => {
  const endpoint = 'https://core.robotint.net/exchange/';
  if (!location.hostname.endsWith('lemanapro.ru')) {
    throw new Error('Откройте страницу perm.lemanapro.ru и запустите сценарий в её Console.');
  }
  if (document.querySelector('#robotint-catalog-refresh')) {
    console.warn('Панель обновления каталога уже открыта.');
    return;
  }

  const panel = document.createElement('section');
  panel.id = 'robotint-catalog-refresh';
  panel.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;width:min(430px,calc(100vw - 32px));padding:18px;background:#fff;color:#222;border:1px solid #aaa;border-radius:10px;box-shadow:0 8px 30px #0004;font:14px/1.45 Arial,sans-serif';
  panel.innerHTML = `
    <strong style="display:block;font-size:16px;margin-bottom:8px">Обновление каталога цветов</strong>
    <div style="font-size:12px;color:#555">Выберите основу. Сценарий запросит HTML виджета и список палитр, загрузит цвета каждой и скачает файл для выбранной основы.</div>
    <label style="display:block;margin:10px 0 7px">Тип основы
      <select data-type style="display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:8px"><option value="A">A — белая, пастельные оттенки</option><option value="C">C — прозрачная, яркие оттенки</option></select>
    </label>
    <label style="display:block;margin:7px 0">BARCODE из тела запроса init для товара этой основы
      <input data-barcode placeholder="Например, 4690364004132" inputmode="numeric" style="display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:8px">
    </label>
    <label style="display:block;margin:12px 0 8px">SECRET из Request URL запроса get_styles в Network
      <input data-secret type="password" autocomplete="off" style="display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:8px">
    </label>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button data-run type="button" style="padding:8px 12px;cursor:pointer">Обновить каталог</button>
      <button data-close type="button" style="padding:8px 12px;cursor:pointer">Закрыть</button>
    </div>
    <div data-status role="status" style="margin-top:10px;white-space:pre-wrap;color:#555"></div>`;
  document.body.append(panel);

  const status = panel.querySelector('[data-status]');
  const button = panel.querySelector('[data-run]');
  panel.querySelector('[data-type]').addEventListener('change', event => {
    const barcode = panel.querySelector('[data-barcode]');
    barcode.value = '';
    barcode.placeholder = event.target.value === 'A'
      ? 'Введите BARCODE для товара с основой A'
      : 'Введите BARCODE для товара с основой C';
  });
  panel.querySelector('[data-close]').addEventListener('click', () => panel.remove());
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const addUnique = (list, seen, id, name) => {
    if (id == null || name == null) return;
    const cleanId = String(id).trim();
    const cleanName = String(name).replace(/\s+/g, ' ').trim();
    if (!cleanId || !cleanName || seen.has(cleanId)) return;
    seen.add(cleanId);
    list.push({ id: cleanId, name: cleanName });
  };
  const parsePaletteHtml = (html, list, seen) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('.tint-select-item[data-value]').forEach(element => {
      addUnique(list, seen, element.getAttribute('data-value'), element.textContent);
    });
    doc.querySelectorAll('[data-collection-id][data-collection-name]').forEach(element => {
      addUnique(list, seen, element.getAttribute('data-collection-id'), element.getAttribute('data-collection-name'));
    });
  };
  const parseColorHtml = (html, paletteName) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const colors = [];
    const seen = new Set();
    doc.querySelectorAll('[data-id][data-name][data-collection-name]').forEach(element => {
      const style = element.getAttribute('style') || '';
      const hex = element.getAttribute('data-hex') || style.match(/background\s*:\s*(#[\da-f]{6})\b/i)?.[1];
      const id = element.getAttribute('data-id')?.trim();
      const name = element.getAttribute('data-name')?.trim();
      const actualPaletteName = element.getAttribute('data-collection-name')?.trim() || paletteName;
      if (!id || !name || !hex || seen.has(id)) return;
      seen.add(id);
      colors.push({ id, name, hex: hex.toUpperCase(), paletteName: actualPaletteName });
    });
    return colors;
  };
  const request = async (url, options = {}) => {
    const response = await fetch(url, {
      method: 'GET', headers: { accept: '*/*' }, mode: 'cors', credentials: 'omit', ...options
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 250)}`);
    return text;
  };
  const downloadJson = (filename, data) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  button.addEventListener('click', async () => {
    const secret = panel.querySelector('[data-secret]').value.trim();
    if (!secret) { status.textContent = 'Введите SECRET из Request URL get_styles.'; return; }
    const baseType = panel.querySelector('[data-type]').value;
    const barcode = panel.querySelector('[data-barcode]').value.trim();
    if (!barcode) { status.textContent = 'Введите BARCODE для товара выбранной основы.'; return; }
    button.disabled = true;
    panel.querySelector('[data-secret]').value = '';
    const params = new URLSearchParams({
      action: 'init', stylesInited: '1', BARCODE: barcode, CLIENT_ID: '76', SECRET: secret,
      WITH_PRICE: '1', USE_SWITCHER: '0', USER_ID: '00093264A9', version: '1.7.4'
    });
    let palettes = [];
    try {
      status.textContent = 'Запрашиваю виджет и список палитр (init)…';
      const stylesText = await request(endpoint, {
        method: 'POST',
        headers: {
          accept: '*/*',
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        body: params
      });
      const seen = new Set();
      parsePaletteHtml(stylesText, palettes, seen);
      try {
        const visit = (value, visited = new Set()) => {
          if (typeof value === 'string') {
            if (value.includes('tint-select-item') || value.includes('data-collection-id')) parsePaletteHtml(value, palettes, seen);
            return;
          }
          if (!value || typeof value !== 'object' || visited.has(value)) return;
          visited.add(value);
          if (Array.isArray(value)) { value.forEach(item => visit(item, visited)); return; }
          const idKeys = ['data-value', 'id', 'ID', 'value', 'collection_id', 'collectionId', 'COLLECTION_ID'];
          const nameKeys = ['name', 'title', 'text', 'label', 'collection_name', 'collectionName', 'COLLECTION_NAME', 'collection_title', 'style_name', 'styleName'];
          const idKey = idKeys.find(key => Object.prototype.hasOwnProperty.call(value, key));
          const nameKey = nameKeys.find(key => Object.prototype.hasOwnProperty.call(value, key));
          if (idKey && nameKey && typeof value[nameKey] === 'string') addUnique(palettes, seen, value[idKey], value[nameKey]);
          Object.entries(value).forEach(([key, child]) => {
            if (/^\d+$/.test(key) && typeof child === 'string') addUnique(palettes, seen, key, child);
            visit(child, visited);
          });
        };
        visit(JSON.parse(stylesText));
      } catch {
        // init may return HTML or JSON containing the HTML fragment.
      }
      if (!palettes.length) throw new Error('В HTML-ответе init не найден список палитр. Проверьте Network → Response.');
    } catch (error) {
      status.textContent = `Не удалось получить палитры: ${error.message}`;
      console.error('init:', error);
      button.disabled = false;
      return;
    }

    const errors = [];
    const report = [];
    const catalogPalettes = palettes.map(palette => ({ id: palette.id, name: palette.name, colors: [] }));
    for (let index = 0; index < palettes.length; index++) {
      const palette = palettes[index];
      status.textContent = `Палитр ${palettes.length}. Загружаю цвета ${index + 1}/${palettes.length}: ${palette.name}`;
      try {
        const colorParams = new URLSearchParams({
          action: 'get-colors', CLIENT_ID: '76', SECRET: secret,
          WITH_PRICE: '1', USE_SWITCHER: '0', USER_ID: '00093264A9',
          BARCODE: barcode, version: '1.7.4', COLLECTION_ID: palette.id
        });
        const html = await request(endpoint, {
          method: 'POST',
          headers: {
            accept: '*/*',
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
          },
          body: colorParams
        });
        const colors = parseColorHtml(html, palette.name);
        if (!colors.length) throw new Error('Ответ получен, но записи цветов с ID, названием и HEX не распознаны.');
        catalogPalettes[index].colors = colors.map(({ id, name, hex }) => ({ id, name, hex }));
        report.push({ palette: palette.name, id: palette.id, colors: colors.length, status: 'OK' });
      } catch (error) {
        const detail = String(error?.message || error);
        errors.push({ paletteId: palette.id, paletteName: palette.name, error: detail });
        report.push({ palette: palette.name, id: palette.id, colors: 0, status: 'ERROR', error: detail });
      }
      if (index + 1 < palettes.length) await pause(300);
    }

    const totalColors = catalogPalettes.reduce((sum, palette) => sum + palette.colors.length, 0);
    const catalog = {
      schemaVersion: 1,
      baseType,
      generatedAt: new Date().toISOString(),
      complete: errors.length === 0,
      errors,
      palettes: catalogPalettes
    };
    const filename = errors.length ? `catalog-type-${baseType.toLowerCase()}-partial.json` : `catalog-type-${baseType.toLowerCase()}.json`;
    downloadJson(filename, catalog);
    console.table(report);
    status.textContent = `Готово. Палитр: ${palettes.length}; цветов: ${totalColors.toLocaleString('ru-RU')}; ошибок: ${errors.length}.\nСкачан ${filename}.` +
      (errors.length ? '\nОткройте строки ERROR в Console. Частичный каталог можно загрузить в приложение, но проверьте ошибки перед публикацией.' : '');
    button.disabled = false;
  });

  console.log('Панель обновления добавлена. Введите SECRET из Request URL get_styles и нажмите «Обновить каталог».');
})();
