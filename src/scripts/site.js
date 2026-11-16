// Весь интерактив главной: окно заявки, формы, калькулятор, карта, появление блоков.
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
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-goal]');
  if (el) goal(el.dataset.goal);
});

/* Окно «Заказать вывоз» открывается только по нажатию */
const modal = $('#order');
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-open="order"]')) {
    setDrawer(false);
    modal.showModal();
  }
  if (e.target.closest('[data-close]') || e.target === modal) modal.close();
});

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

/* Превью: готовы только главная и площадка Истра, они лежат по отдельным ссылкам */
if (isPreview) {
  const { main, istra, page } = document.body.dataset;
  const inPhone = window.name === 'pv-phone';
  if (inPhone) $('[data-pv]')?.remove();
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="/"]');
    if (!a) return;
    const href = a.getAttribute('href');
    const url = href === '/punkty-priema/istra' ? istra : (href === '/' || href.startsWith('/#')) ? main : '';
    const here = (href === '/' && page === 'home') || (href === '/punkty-priema/istra' && page === 'yard');
    if (here) { e.preventDefault(); scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (url) { // открываем соседнюю страницу превью, потом возвращаем настоящую ссылку
      a.href = url; a.target = '_blank'; a.rel = 'noopener';
      setTimeout(() => { a.setAttribute('href', href); a.removeAttribute('target'); }, 0);
      return;
    }
    e.preventDefault();
    toast('Эта страница появится после утверждения главной');
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
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const digits = form.phone.value.replace(/\D/g, '');
    if (digits.length < 10) { say('Укажите телефон полностью, с кодом: +7 900 000-00-00', true); form.phone.focus(); return; }
    if (!form.agree.checked) { say('Отметьте согласие на обработку персональных данных', true); form.agree.focus(); return; }
    if (isPreview) { say('Это превью: заявка никуда не отправлена. На сайте она уйдёт на почту компании.'); return; }
    try {
      const res = await fetch(form.action, { method: 'POST', body: new FormData(form) });
      if (!res.ok) throw new Error(String(res.status));
      form.reset();
      say('Заявка отправлена. Перезвоним в ближайшее время.');
      goal('form');
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
    if (track) goal('calc');
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

/* Блоки мягко всплывают при прокрутке. Текст остаётся в HTML: поисковик видит его всегда */
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
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
