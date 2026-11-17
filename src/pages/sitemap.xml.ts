// Карта сайта: главная, готовые страницы площадок и страницы услуг.
import site from '../data/site.json';
import yards from '../data/yards.json';
import services from '../data/services.json';

export function GET() {
  const paths = [
    '/',
    ...yards.filter((y) => 'page' in y && y.page).map((y) => `/punkty-priema/${y.slug}`),
    ...services.map((s) => `/uslugi/${s.slug}`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths
    .map((p) => `  <url><loc>${new URL(p, site.url).href}</loc></url>`)
    .join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
