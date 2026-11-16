// Забирает прайс из Excel-файла и обновляет src/data/prices.json.
// Источник: PRICES_URL — публичная ссылка на файл на Яндекс Диске (в GitHub это секрет),
//           или PRICES_FILE — путь к файлу на компьютере (для проверки).
// Если в таблице ошибка, prices.json не меняется: на сайте остаются старые цены,
// а скрипт завершается с ошибкой — GitHub пришлёт письмо.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import ExcelJS from 'exceljs';

const OUT = new URL('../src/data/prices.json', import.meta.url);
const HEADERS = ['Категория', 'Позиция', 'Цена', 'Единица', 'На главной'];
const UNITS = ['₽/кг', '₽/т'];
const WORDS = ['договорная', 'не принимаем'];
const MIN_ROWS = 10;        // меньше строк — файл, скорее всего, обрезан
const MAX_JUMP = 3;         // цена изменилась больше чем в 3 раза — похоже на опечатку
const FEATURED = [2, 3];    // сколько позиций можно показать на первом экране

const { PRICES_URL, PRICES_FILE, PRICES_ALLOW_JUMP, GITHUB_OUTPUT } = process.env;
const out = (k, v) => GITHUB_OUTPUT && appendFileSync(GITHUB_OUTPUT, `${k}=${v}\n`);

async function load() {
  if (PRICES_FILE) return readFileSync(PRICES_FILE);
  const api = 'https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=' + encodeURIComponent(PRICES_URL);
  const meta = await fetch(api);
  if (!meta.ok) throw new Error(`Яндекс Диск не отдал файл (код ${meta.status}). Проверьте, что ссылка открыта «для всех, у кого есть ссылка».`);
  const file = await fetch((await meta.json()).href);
  if (!file.ok) throw new Error(`Не удалось скачать файл с Яндекс Диска (код ${file.status}).`);
  return Buffer.from(await file.arrayBuffer());
}

// Значение ячейки как текст или число, без форматирования
function plain(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if ('result' in v) return plain(v.result);
    if ('richText' in v) return v.richText.map((t) => t.text).join('').trim();
    if ('text' in v) return String(v.text).trim();
    return String(v).trim();
  }
  return typeof v === 'string' ? v.replace(/ /g, ' ').trim() : v;
}

function parsePrice(v) {
  if (typeof v === 'number') return v;
  const s = String(v).toLowerCase();
  if (WORDS.includes(s)) return s;
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  return s !== '' && Number.isFinite(n) ? n : null;
}

if (!PRICES_URL && !PRICES_FILE) {
  console.log('Источник цен не задан (PRICES_URL или PRICES_FILE) — оставляю цены из prices.json.');
  out('changed', 'false');
  process.exit(0);
}

const errors = [];
let rows = [];
try {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await load());
  const ws = wb.getWorksheet('Цены') ?? wb.worksheets[0];
  const head = HEADERS.map((_, i) => plain(ws.getRow(1).getCell(i + 1).value));
  if (head.join('|') !== HEADERS.join('|')) {
    errors.push(`Первая строка должна быть: ${HEADERS.join(' | ')}. Сейчас: ${head.join(' | ')}`);
  } else {
    const seen = new Set();
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return;
      const [category, name, rawPrice, rawUnit, rawFeat] = HEADERS.map((_, i) => plain(row.getCell(i + 1).value));
      if ([category, name, rawPrice, rawUnit, rawFeat].every((c) => c === '')) return;
      const at = `Строка ${n}`;
      if (!category) errors.push(`${at}: пустая «Категория»`);
      if (!name) errors.push(`${at}: пустая «Позиция»`);
      if (seen.has(name)) errors.push(`${at}: позиция «${name}» повторяется`);
      seen.add(name);
      const price = parsePrice(rawPrice);
      const feat = String(rawFeat).toLowerCase();
      let unit = String(rawUnit);
      if (price === null) errors.push(`${at} («${name}»): в «Цене» должно быть число либо слова «договорная» или «не принимаем». Сейчас: «${rawPrice}»`);
      else if (typeof price === 'number') {
        if (!(price > 0)) errors.push(`${at} («${name}»): цена должна быть больше нуля`);
        if (!UNITS.includes(unit)) errors.push(`${at} («${name}»): «Единица» должна быть ${UNITS.join(' или ')}. Сейчас: «${unit}»`);
      } else unit = '—';
      if (!['', 'да', 'нет'].includes(feat)) errors.push(`${at} («${name}»): в «На главной» пишите «да» или оставьте пусто`);
      if (feat === 'да' && typeof price !== 'number') errors.push(`${at} («${name}»): на главной можно показать только позицию с ценой-числом`);
      rows.push([category, name, price, unit, feat === 'да' ? 'да' : '']);
    });
    if (rows.length < MIN_ROWS) errors.push(`В таблице всего ${rows.length} строк с ценами — похоже, файл обрезан (ждём не меньше ${MIN_ROWS})`);
    const nFeat = rows.filter((r) => r[4] === 'да').length;
    if (nFeat < FEATURED[0] || nFeat > FEATURED[1]) errors.push(`«да» в столбце «На главной» должно стоять у ${FEATURED.join('–')} позиций. Сейчас: ${nFeat}`);
  }
} catch (e) {
  errors.push(e.message);
}

const current = JSON.parse(readFileSync(OUT, 'utf8'));
if (!errors.length && !PRICES_ALLOW_JUMP) {
  const old = new Map(current.rows.map((r) => [r[1], r[2]]));
  for (const [, name, price] of rows) {
    const was = old.get(name);
    if (typeof was === 'number' && typeof price === 'number' && (price / was > MAX_JUMP || was / price > MAX_JUMP)) {
      errors.push(`«${name}»: цена изменилась с ${was} до ${price} — больше чем в ${MAX_JUMP} раза. Если это не опечатка, запустите обновление вручную с галочкой «Разрешить резкое изменение цен».`);
    }
  }
}

if (errors.length) {
  console.error('Цены НЕ обновлены, на сайте остались прежние. Что исправить в таблице:\n' + errors.map((e) => ' • ' + e).join('\n'));
  out('changed', 'false');
  process.exit(1);
}

if (JSON.stringify(rows) === JSON.stringify(current.rows)) {
  console.log(`Цены не менялись (${rows.length} позиций).`);
  out('changed', 'false');
} else {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(new Date());
  const lines = rows.map((r) => '    ' + JSON.stringify(r)).join(',\n');
  writeFileSync(OUT, `{\n  "updated": "${today}",\n  "rows": [\n${lines}\n  ]\n}\n`);
  console.log(`Цены обновлены: ${rows.length} позиций, дата ${today}.`);
  out('changed', 'true');
}
