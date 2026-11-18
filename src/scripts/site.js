// Весь интерактив сайта: окна заявки, формы, калькулятор, карта, появление блоков.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const isPreview = document.body.hasAttribute('data-preview');
const METRIKA_ID = 87324352;

/* Сообщение внизу экрана */
const toastEl = $('.toast');
let toastTimer;
function toast(text) {
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), 3500);
}

/* Цели Метрики: data-goal="phone" и т. п. */
const goal = (name) => window.ym?.(METRIKA_ID, 'reachGoal', name);
// Цели, которые достаточно засчитать один раз за просмотр страницы (например, калькулятор):
// иначе каждое нажатие клавиши уходит в Метрику отдельным запросом.
const reached = new Set();
const goalOnce = (name) => { if (!reached.has(name)) { reached.add(name); goal(name); } };
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-goal]');
  if (el) goal(el.dataset.goal);
});

/* Окна заявки открываются только по нажатию: data-open="id окна".
   data-machine на кнопке сразу выбирает машину в форме аренды. */
document.addEventListener('click', (e) => {
  const opener = e.target.closest('[data-open]');
  const dlg = opener && document.getElementById(opener.dataset.open);
  if (dlg) {
    setDrawer(false);
    const option = opener.dataset.machine && $(`option[data-id="${opener.dataset.machine}"]`, dlg);
    if (option) option.selected = true;
    dlg.showModal();
  }
  if (e.target.closest('[data-close]')) e.target.closest('dialog')?.close();
});

/* Закрытие окна нажатием по затемнению вокруг. Браузеры с closedby="any" (Chrome, Edge, Firefox) делают это сами.
   Для остальных (Safari) проверяем, что нажали именно снаружи окна: нажатие на пустое место внутри окна
   тоже приходит «на само окно», и раньше из-за этого форма закрывалась вместе с введённым телефоном. */
if (!('closedBy' in HTMLDialogElement.prototype)) {
  $$('dialog[closedby="any"]').forEach((dlg) => dlg.addEventListener('click', (e) => {
    if (e.target !== dlg) return;
    const r = dlg.getBoundingClientRect();
    const inside = r.top <= e.clientY && e.clientY <= r.bottom && r.left <= e.clientX && e.clientX <= r.right;
    if (!inside) dlg.close();
  }));
}

/* Яндекс Карта: на главной — все площадки, на странице площадки — одна точка. Скрипт Яндекса грузится, только когда блок подходит к экрану,
   чтобы не замедлять первую загрузку. Если карта не загрузилась, остаётся схема. */
const mapFig = $('[data-ymap]');
if (mapFig) {
  const start = () => {
    const s = document.createElement('script');
    s.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(mapFig.dataset.ymap)}&lang=ru_RU`;
    s.async = true;
    s.onload = () => window.ymaps.ready(buildMap);
    document.head.append(s);
  };
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { io.disconnect(); start(); }
  }, { rootMargin: '400px 0px' });
  io.observe(mapFig);
}
function buildMap() {
  const ymaps = window.ymaps;
  const points = JSON.parse(mapFig.dataset.ymapPoints);
  const box = $('.map__live', mapFig);
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2459b3';
  const touch = matchMedia('(pointer: coarse)').matches;
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  mapFig.classList.add('is-live');
  const single = points.length === 1;
  const zoom = Number(mapFig.dataset.ymapZoom) || 15;
  const map = new ymaps.Map(box, { center: single ? [points[0].lat, points[0].lon] : [55.76, 37.9], zoom: single ? zoom : 8, controls: ['zoomControl'] }, { suppressMapOpenBlock: false });
  map.behaviors.disable('scrollZoom'); // колесо мыши прокручивает страницу, а не карту
  if (touch) map.behaviors.disable('drag'); // на телефоне карта двигается двумя пальцами
  const cluster = new ymaps.Clusterer({ clusterIconColor: accent, groupByCoordinates: false, clusterDisableClickZoom: false });
  points.forEach((p) => {
    const links = [
      `<a href="${esc(p.route)}" target="_blank" rel="noopener">Маршрут</a>`,
      p.page && `<a href="${esc(p.page)}">Страница площадки</a>`,
      p.card && `<a href="${esc(p.card)}" target="_blank" rel="noopener">Отзывы в Яндекс Картах</a>`,
    ].filter(Boolean).join(' · ');
    const mark = new ymaps.Placemark([p.lat, p.lon], {
      hintContent: `Капитал Метт — ${p.name}`,
      balloonContentHeader: `Капитал Метт — ${esc(p.name)}`,
      balloonContentBody: `${esc(p.address)}<br>Круглосуточно<br><a href="${esc(p.tel)}" data-goal="phone"><b>${esc(p.phone)}</b></a>`,
      balloonContentFooter: links,
    }, { preset: 'islands#dotIcon', iconColor: accent });
    mark.events.add('balloonopen', () => {
      $$('.yard.is-active').forEach((el) => el.classList.remove('is-active'));
      $(`#yard-${p.slug}`)?.classList.add('is-active');
    });
    if (single) map.geoObjects.add(mark); else cluster.add(mark);
  });
  if (!single) {
    map.geoObjects.add(cluster);
    map.setBounds(cluster.getBounds(), { checkZoomRange: true, zoomMargin: 36 });
  }
}

/* Бургер-меню */
const burger = $('.burger'), drawer = $('#drawer');
function setDrawer(open) {
  if (!burger) return;
  drawer.hidden = !open;
  burger.setAttribute('aria-expanded', String(open));
  burger.classList.toggle('is-open', open);
}
burger?.addEventListener('click', () => setDrawer(drawer.hidden));
drawer?.addEventListener('click', (e) => { if (e.target.closest('a')) setDrawer(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setDrawer(false); });

/* Ссылки вида /#uslugi на главной просто прокручивают страницу */
const isHome = ['home', 'v2'].includes(document.body.dataset.page);
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="/#"]');
  if (!a || !isHome) return;
  const target = $(a.getAttribute('href').slice(1));
  if (target) { e.preventDefault(); e.stopImmediatePropagation(); target.scrollIntoView({ behavior: 'smooth' }); }
}, true);

/* Превью: каждая готовая страница лежит по отдельной ссылке (см. Base.astro) */
if (isPreview) {
  const routes = JSON.parse(document.body.dataset.routes || '{}');
  const herePath = document.body.dataset.path;
  const inPhone = window.name === 'pv-phone';
  if (inPhone) $('[data-pv]')?.remove();
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="/"]');
    if (!a) return;
    const href = a.getAttribute('href');
    const clean = href.split('#')[0] || '/';
    if (clean === herePath) { e.preventDefault(); scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const url = routes[clean];
    if (url) { // открываем соседнюю страницу превью, потом возвращаем настоящую ссылку
      a.href = url; a.target = '_blank'; a.rel = 'noopener';
      setTimeout(() => { a.setAttribute('href', href); a.removeAttribute('target'); }, 0);
      return;
    }
    e.preventDefault();
    toast('Этой страницы в превью пока нет');
  });
  $('[data-phone-view]')?.addEventListener('click', () => {
    const box = document.createElement('div');
    box.className = 'pvphone';
    box.innerHTML = '<div class="pvphone__bar"><span>Так страница выглядит на телефоне шириной 390 px</span><button type="button">Закрыть</button></div><iframe name="pv-phone" title="Вид на телефоне"></iframe>';
    box.querySelector('iframe').src = location.href.split('#')[0];
    box.querySelector('button').addEventListener('click', () => { box.remove(); document.documentElement.style.overflow = ''; });
    document.documentElement.style.overflow = 'hidden';
    document.body.append(box);
  });
}

/* Формы заявки */
$$('form[data-form]').forEach((form) => {
  const msg = $('.form__msg', form);
  const say = (text, error) => {
    msg.textContent = text;
    msg.classList.toggle('is-error', Boolean(error));
    msg.hidden = false;
  };
  // Ошибка поля видна и для экранного диктора: aria-invalid + ссылка на текст ошибки.
  // Ставится только после попытки отправить и снимается, как только поле поправили.
  if (!msg.id) msg.id = `${form.id || 'form'}-msg`;
  const mark = (field, bad) => {
    if (bad) { field.setAttribute('aria-invalid', 'true'); field.setAttribute('aria-describedby', msg.id); }
    else { field.removeAttribute('aria-invalid'); field.removeAttribute('aria-describedby'); }
  };
  form.addEventListener('input', (e) => {
    if (e.target.getAttribute('aria-invalid') !== 'true') return;
    const ok = e.target === form.phone ? form.phone.value.replace(/\D/g, '').length >= 10 : e.target.checked;
    if (ok) { mark(e.target, false); msg.hidden = true; }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const digits = form.phone.value.replace(/\D/g, '');
    mark(form.phone, digits.length < 10);
    mark(form.agree, !form.agree.checked);
    if (digits.length < 10) { say('Укажите телефон полностью, с кодом: +7 900 000-00-00', true); form.phone.focus(); return; }
    if (!form.agree.checked) { say('Отметьте согласие на обработку персональных данных', true); form.agree.focus(); return; }
    if (isPreview) { say('Это превью: заявка никуда не отправлена. На сайте она уйдёт на почту компании.'); return; }
    try {
      const res = await fetch(form.action, { method: 'POST', body: new FormData(form) });
      if (!res.ok) throw new Error(String(res.status));
      form.reset();
      say('Заявка отправлена. Перезвоним в ближайшее время.');
      goal('form');
      if (form.dataset.formGoal) goal(form.dataset.formGoal); // с какой страницы заявка
    } catch {
      say('Заявка не отправилась. Позвоните нам: 8-800-550-45-36', true);
    }
  });
});

/* Калькулятор: цены вшиты в страницу при сборке */
const calc = $('form[data-calc]');
if (calc) {
  const { items, zasor, negotiable } = JSON.parse(calc.dataset.calc);
  const fmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  const fmtPrice = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
  const sum = $('#calc-sum'), note = $('#calc-note'), select = calc.item;
  const baseNote = 'Точная сумма — после взвешивания и оценки засора на площадке.';

  function fillItems() {
    const cat = calc.cat.value;
    select.replaceChildren(...items.filter((i) => i.c === cat).map((i) => new Option(`${i.n} — ${fmtPrice.format(i.p)} ${i.u}`, i.n)));
  }
  function recount(track) {
    const item = items.find((i) => i.n === select.value);
    const weight = parseFloat(String(calc.weight.value).replace(',', '.'));
    if (!item || !(weight > 0)) { sum.textContent = '≈ 0 ₽'; note.textContent = 'Укажите вес лома.'; return; }
    const kg = calc.unit.value === 't' ? weight * 1000 : weight;
    if (negotiable.positions.includes(item.n) && kg >= negotiable.fromKg) {
      sum.textContent = 'Цена договорная';
      note.textContent = `Партии меди и латуни от ${negotiable.fromKg} кг считаем отдельно. Позвоните, назовём цену.`;
      return;
    }
    const perKg = item.u === '₽/т' ? item.p / 1000 : item.p;
    const z = zasor[item.c] || 0;
    sum.textContent = `≈ ${fmt.format(kg * perKg * (1 - z / 100))} ₽`;
    note.textContent = z ? `Учли засор ${z} %. ${baseNote}` : baseNote;
    if (track) goalOnce('calc');
  }
  calc.addEventListener('input', (e) => {
    if (e.target.name === 'cat') fillItems();
    recount(true);
  });
  calc.addEventListener('submit', (e) => e.preventDefault());
}

/* Карта и карточки площадок подсвечивают друг друга */
const yardEls = (slug) => $$(`[data-yard="${slug}"]`);
$$('[data-yard]').forEach((el) => {
  const on = () => yardEls(el.dataset.yard).forEach((x) => x.classList.add('is-active'));
  const off = () => yardEls(el.dataset.yard).forEach((x) => x.classList.remove('is-active'));
  el.addEventListener('pointerenter', on);
  el.addEventListener('pointerleave', off);
  el.addEventListener('focusin', on);
  el.addEventListener('focusout', off);
});
$$('a.pin').forEach((pin) => pin.addEventListener('click', (e) => {
  e.preventDefault();
  const card = $(`.yard[data-yard="${pin.dataset.yard}"]`);
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.add('is-picked');
  setTimeout(() => card.classList.remove('is-picked'), 1800);
}));

const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Блик на фоне первого экрана и блока заявки крутится, только пока блок виден:
   за пределами экрана анимация впустую грузит видеокарту телефона. */
const sheens = $$('.hero__sheen');
if (sheens.length && 'IntersectionObserver' in window) {
  // Следим за родителем (он в границах блока; сам блик шире экрана), а паузу ставим блику
  const sheenIo = new IntersectionObserver((entries) => {
    for (const en of entries) $('.hero__sheen', en.target)?.classList.toggle('is-paused', !en.isIntersecting);
  });
  sheens.forEach((el) => sheenIo.observe(el.parentElement));
}

/* Видео, которое автоматически играет на первом экране: при «уменьшить движение» в системе ставим на паузу */
if (calm) $$('video[autoplay]').forEach((v) => { v.removeAttribute('autoplay'); v.pause(); });

/* Видео ниже первого экрана (data-lazy-video) скачивается, только когда до него докрутили.
   Атрибут autoplay заставил бы браузер качать файл сразу при открытии страницы. */
const lazyVideos = $$('video[data-lazy-video]');
if (lazyVideos.length && 'IntersectionObserver' in window) {
  const videoIo = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const v = en.target;
      videoIo.unobserve(v);
      if (v.dataset.poster) v.poster = v.dataset.poster;
      $$('source[data-src]', v).forEach((s) => { s.src = s.dataset.src; });
      v.load();
      if (!calm) v.play().catch(() => {});
    }
  }, { rootMargin: '300px 0px' });
  lazyVideos.forEach((v) => videoIo.observe(v));
}

/* Блоки мягко всплывают при прокрутке. Текст остаётся в HTML: поисковик видит его всегда */
if (!calm && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
  }, { rootMargin: '0px 0px -8% 0px' });
  $$('[data-reveal]').forEach((el) => {
    if (el.getBoundingClientRect().top < innerHeight) return; // первый экран не трогаем
    const i = [...el.parentElement.children].filter((c) => c.hasAttribute('data-reveal')).indexOf(el);
    el.style.transitionDelay = `${Math.min(i, 4) * 60}ms`;
    el.classList.add('will-reveal');
    io.observe(el);
  });
}
