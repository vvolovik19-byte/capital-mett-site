// Общие данные для Яндекс Карты: на главной (все площадки) и на странице площадки (одна точка).
import site from './site.json';

type Yard = { slug: string; name: string; address: string; phones: string[]; lat: number; lon: number; yandex?: string | null };

const tel = (p: string) => 'tel:+' + p.replace(/\D/g, '');
// «Маршрут» строит путь в Яндекс Картах от места, где сейчас человек, до площадки
export const route = (y: { lat: number; lon: number }) => `https://yandex.ru/maps/?rtext=~${y.lat},${y.lon}&rtt=auto`;
// В превью Claude внешние скрипты не грузятся — там остаётся схема или заглушка
export const liveMapKey: string | undefined = import.meta.env.PUBLIC_PREVIEW ? undefined : site.ymapsKey || undefined;

export const mapPoints = (list: Yard[], { withPage = true } = {}) => JSON.stringify(list.map((y) => ({
  name: y.name, address: y.address, lat: y.lat, lon: y.lon, phone: y.phones[0], tel: tel(y.phones[0]),
  page: withPage ? `/punkty-priema/${y.slug}` : null, route: route(y), card: y.yandex ?? null, slug: y.slug,
})));
