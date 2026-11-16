import { defineConfig } from 'astro/config';

// Статический сайт: на выходе готовые HTML-страницы в dist/
export default defineConfig({
  site: 'https://capital-mett.com',
  trailingSlash: 'never',
  build: { format: 'file', assets: 'assets' },
});
