// Цены приходят из Excel-файла (5 столбцов: Категория, Позиция, Цена, Единица, На главной).
// Пока файл не подключён, те же строки лежат в prices.json.
import raw from './prices.json';
import calc from './calculator.json';

export type Price = { category: string; name: string; price: number | string; unit: string; featured: boolean };

export const prices: Price[] = (raw.rows as (string | number)[][]).map(([category, name, price, unit, featured]) => ({
  category: String(category), name: String(name), price, unit: String(unit),
  featured: String(featured).trim().toLowerCase() === 'да',
}));

export const featured = prices.filter((p) => p.featured && typeof p.price === 'number');
export const calculable = prices.filter((p) => typeof p.price === 'number');
export const categories = [...new Set(calculable.map((p) => p.category))];

export const shortName = (name: string) => (calc.shortNames as Record<string, string>)[name] ?? name;
export const categoryName = (c: string) => (calc.categoryNames as Record<string, string>)[c] ?? c;

export const rub = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(n);
export const updatedText = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  .format(new Date(raw.updated + 'T12:00:00')).replace(' г.', '');
export const updatedISO = raw.updated;
