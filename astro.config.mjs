import { defineConfig } from 'astro/config';
import { existsSync, renameSync, statSync } from 'node:fs';

// Страница-раздел (например, /punkty-priema/ — список площадок) лежит рядом с папкой своих страниц.
// После сборки кладём её в эту папку как index.html: так любой сервер и GitHub Pages
// отдают её по адресу со слешем на конце, без особых правил в .htaccess.
const sectionIndexes = {
  name: 'section-indexes',
  hooks: {
    'astro:build:done': ({ dir }) => {
      for (const name of ['punkty-priema']) {
        const page = new URL(`${name}.html`, dir), folder = new URL(`${name}/`, dir);
        if (existsSync(page) && existsSync(folder) && statSync(folder).isDirectory()) renameSync(page, new URL('index.html', folder));
      }
    },
  },
};

// Статический сайт: на выходе готовые HTML-страницы в dist/
export default defineConfig({
  site: 'https://capital-mett.com',
  trailingSlash: 'never',
  build: { format: 'file', assets: 'assets' },
  integrations: [sectionIndexes],
});
