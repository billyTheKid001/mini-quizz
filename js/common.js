// Comportements partagés par toutes les pages : nav, menu mobile, curseur,
// effet magnétique et transitions entre pages.
// Usage : import { initCommon } from './common.js'; initCommon();

const HOVER_TARGETS = 'a, button, input, select, textarea, label, [data-tilt], [data-magnetic], [data-hover]';
const LEAVE_DURATION = 600; // ms, doit correspondre à la transition CSS du rideau

let initialized = false;

export function initCommon() {
  if (initialized) return;
  initialized = true;

  const gsap = window.gsap;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  initNav();
  initActiveLink();
  initBurger();
  initCurtain(reduced);
  initBackToTop(reduced);
  if (gsap && finePointer) initCursor(gsap);
  if (gsap && finePointer && !reduced) initMagnetic(gsap);
}

/* ------------------------------------------------------------------------ */
/* Nav : fond au scroll, se cache vers le bas, revient vers le haut          */
/* ------------------------------------------------------------------------ */
function initNav() {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  let lastY = window.scrollY;
  let ticking = false;

  const update = () => {
    const y = window.scrollY;
    nav.classList.toggle('is-scrolled', y > 20);
    const menuOpen = document.documentElement.classList.contains('menu-open');
    if (!menuOpen && y > lastY + 4 && y > 120) nav.classList.add('is-hidden');
    else if (y < lastY - 4 || y <= 120) nav.classList.remove('is-hidden');
    lastY = y;
    ticking = false;
  };

  window.addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });

  nav.addEventListener('focusin', () => nav.classList.remove('is-hidden'));
  update();
}

// Marque le lien de la page courante (aria-current + style)
function initActiveLink() {
  const file = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a, .footer-links a').forEach((a) => {
    const href = (a.getAttribute('href') || '').split('#')[0];
    if (href && href === file) a.setAttribute('aria-current', 'page');
  });
}

/* ------------------------------------------------------------------------ */
/* Menu mobile plein écran                                                   */
/* ------------------------------------------------------------------------ */
function initBurger() {
  const burger = document.getElementById('nav-burger');
  const links = document.getElementById('nav-links');
  if (!burger || !links) return;
  const root = document.documentElement;

  const setOpen = (open) => {
    root.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
  };

  burger.addEventListener('click', () => setOpen(!root.classList.contains('menu-open')));
  links.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root.classList.contains('menu-open')) {
      setOpen(false);
      burger.focus();
    }
  });
  // Referme si on repasse en desktop
  window.matchMedia('(min-width: 901px)').addEventListener('change', (e) => {
    if (e.matches) setOpen(false);
  });
}

/* ------------------------------------------------------------------------ */
/* Rideau de transition entre pages                                          */
/* ------------------------------------------------------------------------ */
function initCurtain(reduced) {
  let curtain = document.querySelector('.curtain');
  if (!curtain) {
    curtain = document.createElement('div');
    curtain.className = 'curtain';
    curtain.setAttribute('aria-hidden', 'true');
    document.body.prepend(curtain);
  }

  // Entrée : le rideau posé dans le HTML (classe is-covering) se retire
  if (curtain.classList.contains('is-covering')) {
    requestAnimationFrame(() => requestAnimationFrame(() => curtain.classList.remove('is-covering')));
  }

  // Retour arrière depuis le cache : on rouvre la page
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) curtain.classList.remove('is-leaving', 'is-covering');
  });

  if (reduced) return;

  document.addEventListener('click', (e) => {
    const a = e.target instanceof Element && e.target.closest('a[href]');
    if (!a || e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target && a.target !== '_self') return;
    if (a.hasAttribute('download')) return;

    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    // Même page (ancre) : laissé au défilement fluide
    if (url.pathname === location.pathname) return;

    e.preventDefault();
    curtain.classList.add('is-leaving');
    setTimeout(() => { location.href = url.href; }, LEAVE_DURATION);
  });
}

/* ------------------------------------------------------------------------ */
/* Bouton "retour en haut" du footer                                         */
/* ------------------------------------------------------------------------ */
function initBackToTop(reduced) {
  document.querySelectorAll('[data-back-to-top]').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    });
  });
}

/* ------------------------------------------------------------------------ */
/* Curseur personnalisé (créé si absent du HTML)                             */
/* ------------------------------------------------------------------------ */
function ensureCursorElements() {
  let cursor = document.getElementById('cursor');
  let dot = document.getElementById('cursor-dot');
  if (!cursor) {
    cursor = document.createElement('div');
    cursor.className = 'cursor';
    cursor.id = 'cursor';
    document.body.appendChild(cursor);
  }
  if (!dot) {
    dot = document.createElement('div');
    dot.className = 'cursor-dot';
    dot.id = 'cursor-dot';
    document.body.appendChild(dot);
  }
  return { cursor, dot };
}

function initCursor(gsap) {
  const { cursor, dot } = ensureCursorElements();

  document.documentElement.classList.add('has-cursor');
  gsap.set([cursor, dot], { xPercent: -50, yPercent: -50 });

  const cx = gsap.quickTo(cursor, 'x', { duration: 0.45, ease: 'power3' });
  const cy = gsap.quickTo(cursor, 'y', { duration: 0.45, ease: 'power3' });
  const dx = gsap.quickTo(dot, 'x', { duration: 0.1, ease: 'power3' });
  const dy = gsap.quickTo(dot, 'y', { duration: 0.1, ease: 'power3' });
  let visible = false;

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    if (!visible) {
      gsap.set([cursor, dot], { x: e.clientX, y: e.clientY });
      cursor.classList.add('is-visible');
      dot.classList.add('is-visible');
      visible = true;
    }
    cx(e.clientX);
    cy(e.clientY);
    dx(e.clientX);
    dy(e.clientY);
  }, { passive: true });

  document.addEventListener('mouseleave', () => {
    cursor.classList.remove('is-visible');
    dot.classList.remove('is-visible');
    visible = false;
  });

  document.addEventListener('mouseover', (e) => {
    const hit = e.target instanceof Element && e.target.closest(HOVER_TARGETS);
    cursor.classList.toggle('is-hover', Boolean(hit));
  });
}

/* ------------------------------------------------------------------------ */
/* Effet magnétique sur [data-magnetic]                                      */
/* ------------------------------------------------------------------------ */
export function bindMagnetic(el, gsap = window.gsap) {
  if (!gsap || el.dataset.magneticBound) return;
  el.dataset.magneticBound = 'true';
  const inner = el.querySelector('span');
  const strength = el.classList.contains('btn') ? 0.35 : 0.45;

  el.addEventListener('mousemove', (e) => {
    const r = el.getBoundingClientRect();
    const relX = e.clientX - (r.left + r.width / 2);
    const relY = e.clientY - (r.top + r.height / 2);
    gsap.to(el, { x: relX * strength, y: relY * strength, duration: 0.4, ease: 'power3.out', overwrite: 'auto' });
    if (inner) gsap.to(inner, { x: relX * 0.12, y: relY * 0.12, duration: 0.4, ease: 'power3.out', overwrite: 'auto' });
  });

  el.addEventListener('mouseleave', () => {
    gsap.to(el, { x: 0, y: 0, duration: 1, ease: 'elastic.out(1, 0.35)', overwrite: 'auto' });
    if (inner) gsap.to(inner, { x: 0, y: 0, duration: 1, ease: 'elastic.out(1, 0.35)', overwrite: 'auto' });
  });
}

function initMagnetic(gsap) {
  document.querySelectorAll('[data-magnetic]').forEach((el) => bindMagnetic(el, gsap));
}
