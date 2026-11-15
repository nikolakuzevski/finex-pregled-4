// Finex website, direction 4 (the annual report).
// - MK/EN switch: Macedonian in the markup, English in data-en (inner HTML) and data-en-<attr>.
//   ?lang=en opens the page in English. (Same method as website/site/finex.js.)
// - Phone menu, bar turns to paper once the page moves, current section marked in the menu.
// - The signature move: the cover is pinned, the building photo opens from its column to the
//   whole screen, and the view climbs it floor by floor, one service per floor. Progress is this
//   act's own scroll position; the engine only pins it. Reduced motion gets no pin.
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

// The cover and the building.
// p is this act's scroll progress (0 at the top, 1 when the pin lets go):
//   0 to A   the photo opens from its column on the cover to the whole screen and lands on the
//            bottom floor; the cover's text and contents block step aside;
//   A to B   the view climbs the building, one floor per service, resting a moment on each;
//   B to 1   holds on the top floor, then the page moves on.
const Report = (() => {
  const root = document.documentElement;
  const report = document.querySelector('[data-report]');
  const stage = report.querySelector('[data-sc-stage]');
  const frame = report.querySelector('[data-frame]');
  const layer = report.querySelector('[data-building]');
  const photo = report.querySelector('[data-cover-photo]');
  const text = report.querySelector('[data-cover-text]');
  const toc = report.querySelector('[data-toc]');
  const cards = [...report.querySelectorAll('[data-floor]')];
  const mark = report.querySelector('[data-mark]');
  const title = report.querySelector('.floors__title');
  const bar = document.querySelector('[data-bar]');
  const mq = matchMedia('(prefers-reduced-motion: no-preference) and (min-height: 520px)');

  // Measured on img/floors-bw.jpg (1600 x 2400): the right-hand tips of the white slabs, as a
  // share of the image's width and height. Bottom floor first; the lowest slab is left out
  // because the view cannot centre it without running off the photo.
  const TIP_X = 0.677;
  const FLOORS = [0.789, 0.640, 0.497, 0.364, 0.234, 0.108];
  const A = 0.16, B = 0.94;

  const clamp = (v) => Math.min(1, Math.max(0, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  let on = false, raf = 0, active = -1, g = null;

  function measure() {
    const vw = stage.clientWidth, vh = stage.clientHeight;
    const barH = bar.offsetHeight;
    const margin = parseFloat(getComputedStyle(root).getPropertyValue('--margin')) || 24;
    // Zoomed out so three floors fit in the visible height at once: the one below (where you
    // came from), the one you are on, and the one above (what comes next). GAP is the average
    // distance between slab tips as a share of the photo's height. On wide screens the photo
    // then ends before the screen does; .building__sky carries its sky on.
    const GAP = 0.135, DOCK = 220;
    const sizeFor = (area) => Math.max(vh * 1.15, area / 3.3 / GAP);
    let H = sizeFor(vh - barH), W = H / 1.5, tx = 0;
    const room = vw - W * TIP_X - 28 - margin;
    const dock = room < 250;
    if (dock) {
      // narrow: the open service docks at the bottom, so the floors share what is left
      H = sizeFor(vh - barH - DOCK); W = H / 1.5;
      tx = Math.min(0, vw * 0.75 - W * TIP_X);
    }
    const anchor = dock ? barH + (vh - barH - DOCK) * 0.45 : barH + (vh - barH) * 0.42;
    // the cover's photo column, and the photo drawn in it as in the concept (cover, 30% 50%)
    const s = stage.getBoundingClientRect(), b = photo.getBoundingClientRect();
    const bx = b.left - s.left, by = b.top - s.top, bw = b.width, bh = b.height;
    const fit = Math.max(bw / 1600, bh / 2400), dw = 1600 * fit, dh = 2400 * fit;
    g = {
      vw, vh, W, H, tx, dock, anchor,
      s0: dw / W, x0: bx + (bw - dw) * 0.3, y0: by + (bh - dh) * 0.5,
      clip0: { t: by, r: vw - bx - bw, b: vh - by - bh, l: bx },
      tipX: tx + W * TIP_X,
    };
    layer.style.width = W + 'px';
    layer.style.height = H + 'px';
    root.classList.toggle('is-dock', dock);
    root.style.setProperty('--card-w', Math.min(400, Math.max(250, room)) + 'px');
  }

  // where the view stands for a floor position (0 = bottom floor, 5 = top, fractions between)
  function camY(pos) {
    const i = Math.min(FLOORS.length - 2, Math.floor(pos));
    const y = lerp(FLOORS[i], FLOORS[i + 1], pos - i);
    return Math.min(0, Math.max(g.vh - g.H, g.anchor - y * g.H));
  }

  function progress() {
    const r = report.getBoundingClientRect();
    const travel = r.height - innerHeight;
    return travel > 0 ? clamp(-r.top / travel) : 0;
  }

  // floor position for a progress value: rests on each floor for the first quarter of its step
  function floorAt(p) {
    const u = clamp((p - A) / (B - A)) * (FLOORS.length - 1);
    const i = Math.min(FLOORS.length - 2, Math.floor(u));
    return i + ease(clamp((u - i - 0.25) / 0.75));
  }

  function paint() {
    raf = 0;
    if (!on || !g) return;
    const p = progress();
    const pa = ease(clamp(p / A));
    const pos = floorAt(p);
    const ty = camY(pos);
    const s = lerp(g.s0, 1, pa), x = lerp(g.x0, g.tx, pa), y = lerp(g.y0, ty, pa);
    layer.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s.toFixed(4)})`;
    const k = 1 - pa, c = g.clip0;
    frame.style.clipPath = `inset(${(c.t * k).toFixed(1)}px ${(c.r * k).toFixed(1)}px ${(c.b * k).toFixed(1)}px ${(c.l * k).toFixed(1)}px)`;

    const out = clamp(p / (A * 0.7));
    text.style.opacity = (1 - out).toFixed(3);
    text.style.translate = `${(-50 * pa).toFixed(1)}px 0`;
    const tocOut = clamp(p / (A * 0.45));
    toc.style.opacity = (1 - tocOut).toFixed(3);
    toc.style.translate = `0 ${(40 * tocOut).toFixed(1)}px`;
    toc.style.visibility = tocOut >= 1 ? 'hidden' : '';

    const show = clamp((p - A * 0.75) / (A * 0.25));
    const now = Math.round(pos);
    if (now !== active) { active = now; cards.forEach((el, n) => el.classList.toggle('is-on', n === now)); }
    cards.forEach((el, n) => {
      const tip = ty + FLOORS[n] * g.H;
      if (!g.dock) el.style.transform = `translate(${(g.tipX + 28).toFixed(1)}px, ${(tip - 24).toFixed(1)}px)`;
      el.style.opacity = show.toFixed(3);
    });
    mark.style.transform = `translate(${g.tipX.toFixed(1)}px, ${(ty + FLOORS[now] * g.H).toFixed(1)}px)`;
    mark.style.opacity = show.toFixed(3);
    title.style.opacity = show.toFixed(3);
  }

  function clear() {
    [layer, frame, text, toc, mark, title, ...cards].forEach((el) => {
      el.style.transform = el.style.clipPath = el.style.opacity = el.style.translate = el.style.visibility = '';
    });
    cards.forEach((el) => el.classList.remove('is-on'));
    root.classList.remove('is-dock');
    active = -1;
  }

  function setMode() {
    on = mq.matches;
    root.classList.toggle('is-open-mode', on);
    if (on) { measure(); paint(); } else clear();
  }

  // the scroll position where floor n is in view
  function floorTop(n) {
    const p = A + (n / (FLOORS.length - 1)) * (B - A) + 0.005;
    return report.getBoundingClientRect().top + scrollY + p * (report.offsetHeight - innerHeight);
  }

  setMode();
  mq.addEventListener('change', () => { setMode(); dispatchEvent(new Event('resize')); });
  addEventListener('scroll', () => { if (on && !raf) raf = requestAnimationFrame(paint); }, { passive: true });
  addEventListener('resize', () => { if (on) { measure(); paint(); } }, { passive: true });
  document.addEventListener('finex:lang', () => { if (on) { measure(); paint(); } });
  if (document.fonts) document.fonts.ready.then(() => { if (on) { measure(); paint(); } });

  // With the pin, the services have no place of their own in the document, so links to them
  // climb to their floor.
  const target = (hash) => (hash === '#uslugi' ? 0 : /^#s-[1-6]$/.test(hash) ? Number(hash.slice(3)) - 1 : -1);
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest('a[href^="#"]');
    if (!a || !on) return;
    const n = target(a.getAttribute('href'));
    if (n < 0) return;
    ev.preventDefault();
    scrollTo({ top: floorTop(n), behavior: 'smooth' });
  });
  addEventListener('load', () => {
    const n = target(location.hash);
    if (on && n >= 0) scrollTo({ top: floorTop(n), behavior: 'instant' });
  });

  return { isOpen: () => on, inServices: () => on && progress() > A * 0.6 && report.getBoundingClientRect().bottom > innerHeight * 0.45 };
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
        inView = Report.inServices();
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
