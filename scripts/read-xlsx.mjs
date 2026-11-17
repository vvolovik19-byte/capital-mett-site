// Читает значения ячеек одного листа из .xlsx — без форматирования, только текст и числа.
// Написано своё чтение, потому что файлы, сохранённые не в Excel (Яндекс Документы, Р7, МойОфис,
// LibreOffice, Google Таблицы), бывают устроены внутри чуть иначе, и готовые библиотеки на них падают:
// у тегов бывает префикс (<x:worksheet>), пути к листам абсолютные или относительные, строки
// лежат в общей таблице или прямо в ячейке. Здесь всё это учтено.
import JSZip from 'jszip';

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) => s
  .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => e[0] !== '#' ? (ENT[e] ?? m)
    : String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))))
  .replace(/_x([0-9a-f]{4})_/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));

// Убираем префиксы у тегов: <x:c> → <c>, </x:c> → </c>
const strip = (xml) => xml.replace(/<(\/?)[A-Za-z_][\w.-]*:(?=[A-Za-z_])/g, '<$1');

// Атрибуты тега в объект; префиксы у имён атрибутов отбрасываются (r:id → id)
function attrs(s) {
  const o = {};
  for (const m of s.matchAll(/([\w.:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) o[m[1].replace(/^.*:/, '')] = decode(m[3] ?? m[4]);
  return o;
}

// Текст из <t>…</t> внутри куска (без фонетических подсказок <rPh>)
const texts = (s) => [...s.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g)]
  .map((m) => decode(m[1] ?? '')).join('');

const colIndex = (ref) => [...ref.replace(/[^A-Z]/gi, '').toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

async function file(zip, path) {
  const want = path.replace(/^\/+/, '').toLowerCase();
  const f = Object.values(zip.files).find((e) => e.name.toLowerCase() === want);
  return f ? strip(await f.async('string')) : null;
}

// Путь цели связи относительно папки xl/
function resolve(target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = ['xl'];
  for (const p of target.split('/')) p === '..' ? parts.pop() : p !== '.' && parts.push(p);
  return parts.join('/');
}

/**
 * @returns {{ sheet: string, sheets: string[], rows: Map<number, (string|number)[]> }}
 *   rows: номер строки Excel → значения ячеек по столбцам (A = 0)
 */
export async function readSheet(buffer, preferredName) {
  let zip;
  try { zip = await JSZip.loadAsync(buffer); }
  catch { throw new Error('Файл не открывается как .xlsx. Сохраните его в формате Excel (.xlsx).'); }

  const wb = await file(zip, 'xl/workbook.xml');
  if (!wb) throw new Error('Внутри файла нет книги Excel — похоже, он сохранён не в формате .xlsx (например, .ods или .numbers). Сохраните как .xlsx.');
  const relsXml = (await file(zip, 'xl/_rels/workbook.xml.rels')) ?? '';
  const rels = Object.fromEntries([...relsXml.matchAll(/<Relationship\b([^>]*)>/g)].map((m) => attrs(m[1])).map((a) => [a.Id, a]));

  const sheets = [...wb.matchAll(/<sheet\b([^>]*)>/g)].map((m) => attrs(m[1]));
  if (!sheets.length) throw new Error('В файле не найдено ни одного листа.');
  const pick = sheets.find((s) => s.name?.trim() === preferredName) ?? sheets[0];
  const sheetPath = rels[pick.id] ? resolve(rels[pick.id].Target) : `xl/worksheets/sheet${sheets.indexOf(pick) + 1}.xml`;
  const xml = await file(zip, sheetPath);
  if (!xml) throw new Error(`Не найден лист «${pick.name}» внутри файла (${sheetPath}).`);

  const ssRel = Object.values(rels).find((r) => /sharedStrings$/i.test(r.Type ?? ''));
  const ssXml = (await file(zip, ssRel ? resolve(ssRel.Target) : 'xl/sharedStrings.xml')) ?? '';
  const shared = [...ssXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)].map((m) => texts(m[1] ?? ''));

  const rows = new Map();
  let rowNo = 0;
  for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const ra = attrs(rm[1]);
    rowNo = ra.r ? Number(ra.r) : rowNo + 1;
    const cells = [];
    let col = -1;
    for (const cm of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ca = attrs(cm[1]);
      col = ca.r ? colIndex(ca.r) : col + 1;
      const body = cm[2] ?? '';
      const v = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
      let value = '';
      switch (ca.t) {
        case 's': value = v != null ? (shared[Number(v)] ?? '') : ''; break;
        case 'inlineStr': value = texts(body.match(/<is\b[^>]*>([\s\S]*?)<\/is>/)?.[1] ?? ''); break;
        case 'str': case 'e': value = v != null ? decode(v) : ''; break;
        case 'b': value = v === '1' ? 'да' : v === '0' ? 'нет' : ''; break;
        default: {
          if (v == null || v.trim() === '') break;
          const n = Number(v);
          value = Number.isFinite(n) ? n : decode(v);
        }
      }
      cells[col] = value;
    }
    rows.set(rowNo, Array.from(cells, (c) => c ?? ''));
  }
  return { sheet: pick.name, sheets: sheets.map((s) => s.name), rows };
}
