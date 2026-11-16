// Только для превью: делает пути к файлам относительными,
// чтобы страница открывалась из любой папки. Для хостинга не нужен.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
for (const file of walk(dist)) {
  if (file.endsWith('.html')) {
    writeFileSync(file, readFileSync(file, 'utf8').replaceAll('"/assets/', '"./assets/'));
  } else if (file.endsWith('.css')) {
    writeFileSync(file, readFileSync(file, 'utf8').replaceAll('url(/assets/', 'url(./'));
  }
}
console.log('Пути в dist/ сделаны относительными');
