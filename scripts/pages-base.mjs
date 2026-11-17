// Только для превью на GitHub Pages: там сайт лежит не в корне домена, а в папке репозитория
// (https://<логин>.github.io/<репозиторий>/). Скрипт добавляет эту папку ко всем ссылкам
// и путям к файлам и закрывает превью от поисковиков. Для настоящего хостинга не нужен.
// Запуск: node scripts/pages-base.mjs /capital-mett-site
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const base = (process.argv[2] || '').replace(/\/$/, '');
if (!base.startsWith('/')) throw new Error('Укажите папку, например /capital-mett-site');
const dist = new URL('../dist/', import.meta.url).pathname;
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
for (const file of walk(dist)) {
  if (file.endsWith('.html')) {
    let h = readFileSync(file, 'utf8');
    h = h.replace(/(\s(?:href|src|action)=")\/(?!\/)/g, `$1${base}/`); // ссылки, картинки, скрипты, формы
    h = h.replace(/(&quot;page&quot;:&quot;)\/(?!\/)/g, `$1${base}/`); // ссылки в окнах меток на карте
    if (!h.includes('name="robots"')) h = h.replace('<head>', '<head><meta name="robots" content="noindex, nofollow">');
    writeFileSync(file, h);
  } else if (file.endsWith('.css')) {
    writeFileSync(file, readFileSync(file, 'utf8').replaceAll('url(/assets/', `url(${base}/assets/`));
  }
}
writeFileSync(join(dist, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
console.log(`Ссылки в dist/ переведены на ${base}/, превью закрыто от поисковиков`);
