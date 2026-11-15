// Finex website, direction 4 (the annual report).
// - MK/EN switch: Macedonian in the markup, English in data-en (inner HTML) and data-en-<attr>.
//   ?lang=en opens the page in English. (Same method as website/site/finex.js.)
// - Phone menu, bar turns to paper once the page moves, current section marked in the menu.
// - The signature move: on large screens the cover is pinned and the blue contents block opens
//   over the whole screen into the services page. Progress is this act's own scroll position;
//   the engine only pins it. Phones, small screens and reduced motion get no pin.
// - Contact form: checks the required fields; it is not wired to any inbox yet.
// - Starts the scroll-craft engine (reveals, parallax and the pin's height).
(() => {
  const root = document.documentElement;
  const KEY = 'finex-lang';
  const store = {
    get() { try { return localStorage.getItem(KEY); } catch { return null; } },
    set(v) { try { localStorage.setItem(KEY, v); } catch {} },
  };
  const mk = new Map();
  const ATTRS = ['alt', 'aria-label', 'content', 'title'];

  function apply(lang) {
    lang = lang === 'en' ? 'en' : 'mk';
    root.lang = lang;
    document.querySelectorAll('[data-en]').forEach((el) => {
      if (!mk.has(el)) mk.set(el, el.innerHTML);
      el.innerHTML = lang === 'en' ? el.dataset.en : mk.get(el);
    });
    for (const attr of ATTRS) {
      document.querySelectorAll(`[data-en-${attr}]`).forEach((el) => {
        const key = `mk${attr.replace('-', '')}`;
        if (el.dataset[key] == null) el.dataset[key] = el.getAttribute(attr) || '';
        el.setAttribute(attr, lang === 'en' ? el.getAttribute(`data-en-${attr}`) : el.dataset[key]);
      });
    }
    document.querySelectorAll('[data-lang-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.langSet === lang)));
    document.dispatchEvent(new CustomEvent('finex:lang', { detail: lang }));
  }

  const fromUrl = new URLSearchParams(location.search).get('lang');
  apply(fromUrl || store.get() || 'mk');

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lang-set]');
    if (!b) return;
    store.set(b.dataset.langSet);
    apply(b.dataset.langSet);
  });
})();

// Phone menu
(() => {
  const btn = document.querySelector('[data-menu-toggle]');
  const menu = btn && document.getElementById(btn.getAttribute('aria-controls'));
  if (!menu) return;
  const set = (open) => { btn.setAttribute('aria-expanded', String(open)); menu.classList.toggle('is-open', open); };
  btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
  matchMedia('(min-width: 861px)').addEventListener('change', () => set(false));
})();

// The cover and its contents.
const Report = (() => {
  const root = document.documentElement;
  const report = document.querySelector('[data-report]');
  const stage = report.querySelector('[data-sc-stage]');
  const sheet = report.querySelector('[data-sheet]');
  const toc = report.querySelector('[data-toc]');
  const text = report.querySelector('[data-cover-text]');
  const img = report.querySelector('[data-cover-img]');
  const bar = document.querySelector('[data-bar]');
  const parts = [...sheet.querySelectorAll('[data-spread]')];
  const mq = matchMedia('(min-width: 1000px) and (min-height: 600px) and (prefers-reduced-motion: no-preference)');
  const clamp = (v) => Math.min(1, Math.max(0, v));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  let on = false;
  let box = { t: 0, r: 0, b: 0, l: 0 };
  let raf = 0;

  // Where the contents block sits inside the stage, without the load animation's transform.
  function measure() {
    let x = 0, y = 0, el = toc;
    while (el && el !== stage) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; }
    const W = stage.clientWidth, H = stage.clientHeight;
    box = { t: y, l: x, r: W - x - toc.offsetWidth, b: H - y - toc.offsetHeight };
    root.style.setProperty('--toc-h', toc.offsetHeight + 'px');
  }

  // 0 at the top of the cover, 1 when the pin lets go.
  function progress() {
    const r = report.getBoundingClientRect();
    const travel = r.height - innerHeight;
    return travel > 0 ? clamp(-r.top / travel) : 0;
  }

  function paint() {
    raf = 0;
    if (!on) return;
    const p = progress();
    // The cover holds still for the first few percent, then the sheet opens (p 0.06 to 0.56),
    // and while it finishes the six services arrive one after another (0.36 to 0.75); then it
    // holds.
    const e = ease(clamp((p - 0.06) / 0.5));
    const k = 1 - e;
    const top = bar.offsetHeight;
    sheet.style.clipPath = `inset(${(box.t * k + top * e).toFixed(1)}px ${(box.r * k).toFixed(1)}px ${(box.b * k).toFixed(1)}px ${(box.l * k).toFixed(1)}px)`;
    const fade = clamp(1 - e / 0.22);
    toc.style.opacity = fade.toFixed(3);
    toc.style.visibility = fade > 0 ? '' : 'hidden';
    // Three planes at three rates: the headline lifts, the photo pushes in slowly, the sheet
    // comes over both.
    const q = ease(clamp(p / 0.6));
    text.style.translate = `0 ${(-80 * q).toFixed(1)}px`;
    img.style.scale = (1 + 0.1 * q).toFixed(4);
    img.style.translate = `0 ${(-3 * q).toFixed(2)}%`;
    parts.forEach((el) => {
      const n = Number(el.dataset.spread);
      const v = ease(clamp((p - (0.36 + n * 0.035)) / 0.14));
      el.style.opacity = v.toFixed(3);
      el.style.translate = `0 ${((1 - v) * 24).toFixed(1)}px`;
    });
  }

  function clear() {
    sheet.style.clipPath = '';
    toc.style.opacity = ''; toc.style.visibility = '';
    text.style.translate = '';
    img.style.scale = ''; img.style.translate = '';
    parts.forEach((el) => { el.style.opacity = ''; el.style.translate = ''; });
  }

  function setMode() {
    on = mq.matches;
    root.classList.toggle('is-open-mode', on);
    if (on) { measure(); paint(); } else clear();
  }

  // Where the services page is fully open: the place to land for any link to the services.
  function servicesTop() {
    return report.getBoundingClientRect().top + scrollY + 0.85 * (report.offsetHeight - innerHeight);
  }

  setMode();
  mq.addEventListener('change', () => { setMode(); dispatchEvent(new Event('resize')); });
  addEventListener('scroll', () => { if (on && !raf) raf = requestAnimationFrame(paint); }, { passive: true });
  addEventListener('resize', () => { if (on) { measure(); paint(); } }, { passive: true });
  document.addEventListener('finex:lang', () => { if (on) { measure(); paint(); } });
  if (document.fonts) document.fonts.ready.then(() => { if (on) { measure(); paint(); } });

  // In the pinned mode the services page has no place of its own in the document, so links to
  // it scroll to the point where it is open.
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest('a[href^="#"]');
    if (!a || !on) return;
    const id = a.getAttribute('href').slice(1);
    if (id !== 'uslugi' && !/^s-\d$/.test(id)) return;
    ev.preventDefault();
    scrollTo({ top: servicesTop(), behavior: 'smooth' });
  });
  addEventListener('load', () => {
    if (on && /^#(uslugi|s-\d)$/.test(location.hash)) scrollTo({ top: servicesTop(), behavior: 'instant' });
  });

  return { isOpen: () => on, progress, report };
})();

// Bar: paper once the page moves; the menu marks the section you are in.
(() => {
  const bar = document.querySelector('[data-bar]');
  const links = [...document.querySelectorAll('.bar__nav a[href^="#"]:not(.btn)')];
  const onScroll = () => {
    bar.classList.toggle('is-scrolled', scrollY > 8);
    const mid = innerHeight * 0.45;
    let here = null;
    for (const a of links) {
      const id = a.getAttribute('href').slice(1);
      let inView;
      if (id === 'uslugi' && Report.isOpen()) {
        inView = Report.progress() > 0.45 && Report.report.getBoundingClientRect().bottom > mid;
      } else {
        const r = document.getElementById(id).getBoundingClientRect();
        inView = r.top <= mid && r.bottom > mid;
      }
      if (inView) here = a;
    }
    links.forEach((a) => a.classList.toggle('is-here', a === here));
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
  onScroll();
})();

// Contact form: not connected to an inbox yet, so it says so instead of pretending to send.
(() => {
  const form = document.querySelector('[data-form]');
  if (!form) return;
  const status = form.querySelector('[data-form-status]');
  const text = {
    mk: { missing: 'Пополнете ги име и презиме и телефон или е-пошта.', preview: 'Ова е преглед на страницата: формата ќе почне да праќа пораки откако ќе биде поврзана со вашата е-пошта.' },
    en: { missing: 'Please fill in your name and a phone number or e-mail.', preview: 'This is a preview of the site: the form will start sending messages once it is connected to your e-mail.' },
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = text[document.documentElement.lang === 'en' ? 'en' : 'mk'];
    let first = null;
    form.querySelectorAll('[required]').forEach((f) => {
      const bad = !f.value.trim();
      f.setAttribute('aria-invalid', String(bad));
      if (bad && !first) first = f;
    });
    if (first) { status.textContent = t.missing; first.focus(); return; }
    status.textContent = t.preview;
  });
  form.addEventListener('input', (e) => { if (e.target.value.trim()) e.target.removeAttribute('aria-invalid'); });
})();

if (window.ScrollCraft) window.ScrollCraft.mount(document.body);
dispatchEvent(new Event('scroll'));
