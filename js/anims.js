// Animations de l'interface : loader, curseur, reveals, scroll, interactions.
// GSAP et ScrollTrigger sont chargés en global (scripts defer).

const HOVER_TARGETS = 'a, button, [data-tilt], [data-magnetic]';

// Formate un entier avec des espaces pour les milliers : 4000 -> "4 000"
function formatNumber(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// Progression du scroll de toute la page (0..1)
function pageProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
}

// Progression dans une section (top top -> bottom bottom)
function sectionProgress(el) {
  const r = el.getBoundingClientRect();
  const span = r.height - window.innerHeight;
  return span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
}

export function initAnims({ hero, showcase } = {}) {
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const loader = document.getElementById('loader');
  const loaderCount = document.getElementById('loader-count');

  // Fonctions communes, indépendantes de GSAP
  initNav();
  initAnchors(reduced);
  initMarquee();

  // --- Repli si GSAP est indisponible : tout est visible, rien ne casse ---
  if (!gsap || !ScrollTrigger) {
    if (loaderCount) loaderCount.textContent = '100';
    loader?.classList.add('is-done');
    document.querySelectorAll('[data-count]').forEach((el) => {
      el.textContent = formatNumber(Number(el.dataset.count) || 0);
    });
    initScrollFallback(hero, showcase);
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

  if (finePointer) initCursor(gsap);
  if (finePointer && !reduced) {
    initMagnetic(gsap);
  }
  initTilt(gsap, reduced, finePointer && !reduced);
  initSplit(gsap, reduced);
  initReveals(gsap, reduced);
  initCounters(gsap, ScrollTrigger, reduced);
  initScrollScenes(gsap, ScrollTrigger, hero, showcase, reduced);
  initLoaderAndIntro(gsap, ScrollTrigger, loader, loaderCount, reduced);

  // Recalcule les positions une fois les polices chargées
  document.fonts?.ready?.then(() => ScrollTrigger.refresh());
}

/* ------------------------------------------------------------------------ */
/* Loader + intro du hero                                                    */
/* ------------------------------------------------------------------------ */
function initLoaderAndIntro(gsap, ScrollTrigger, loader, loaderCount, reduced) {
  const root = document.documentElement;
  const words = document.querySelectorAll('.hero .word');
  const heroReveals = document.querySelectorAll('.hero [data-reveal]');
  const heroBtn = document.querySelector('.hero .btn');
  const hint = document.querySelector('.hero .scroll-hint');

  // Mouvement réduit : loader très court, contenu affiché directement
  if (reduced) {
    if (loaderCount) loaderCount.textContent = '100';
    gsap.to(loader, {
      autoAlpha: 0,
      duration: 0.3,
      delay: 0.1,
      onComplete: () => loader?.classList.add('is-done'),
    });
    return;
  }

  root.classList.add('is-loading');

  // États de départ (masqués derrière le loader, donc sans flash)
  gsap.set(words, { yPercent: 110 });
  gsap.set(heroReveals, { autoAlpha: 0, y: 24 });
  if (heroBtn) gsap.set(heroBtn, { autoAlpha: 0, scale: 0.7 });
  if (hint) gsap.set(hint, { autoAlpha: 0 });

  const counter = { v: 0 };
  const tl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    onComplete: () => ScrollTrigger.refresh(),
  });

  // Compteur 0 -> 100
  tl.to(counter, {
    v: 100,
    duration: 1.4,
    ease: 'power2.inOut',
    onUpdate: () => {
      if (loaderCount) loaderCount.textContent = String(Math.round(counter.v));
    },
  });

  // Sortie du loader par le haut (clip-path)
  if (loader) {
    tl.to(loader.children, { y: -30, autoAlpha: 0, duration: 0.4, ease: 'power2.in' }, '+=0.1')
      .to(loader, {
        clipPath: 'inset(0% 0% 100% 0%)',
        duration: 0.9,
        ease: 'expo.inOut',
        onComplete: () => {
          loader.classList.add('is-done');
          root.classList.remove('is-loading');
        },
      }, '-=0.1');
  } else {
    root.classList.remove('is-loading');
  }

  // Intro du hero
  tl.to(words, { yPercent: 0, duration: 1.1, stagger: 0.09, ease: 'expo.out' }, '-=0.45')
    .to(heroReveals, { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.12 }, '-=0.8');
  if (heroBtn) tl.to(heroBtn, { autoAlpha: 1, scale: 1, duration: 1, ease: 'back.out(1.7)' }, '-=0.7');
  if (hint) tl.to(hint, { autoAlpha: 1, duration: 0.6 }, '-=0.4');
}

/* ------------------------------------------------------------------------ */
/* Curseur personnalisé                                                      */
/* ------------------------------------------------------------------------ */
function initCursor(gsap) {
  const cursor = document.getElementById('cursor');
  const dot = document.getElementById('cursor-dot');
  if (!cursor || !dot) return;

  document.documentElement.classList.add('has-cursor');
  gsap.set([cursor, dot], { xPercent: -50, yPercent: -50 });

  // quickTo = interpolation fluide (lerp) gérée par GSAP
  const cx = gsap.quickTo(cursor, 'x', { duration: 0.45, ease: 'power3' });
  const cy = gsap.quickTo(cursor, 'y', { duration: 0.45, ease: 'power3' });
  const dx = gsap.quickTo(dot, 'x', { duration: 0.1, ease: 'power3' });
  const dy = gsap.quickTo(dot, 'y', { duration: 0.1, ease: 'power3' });
  let visible = false;

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    if (!visible) {
      // Premier mouvement : on place sans animation
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

  // Agrandissement au survol des éléments interactifs
  document.addEventListener('mouseover', (e) => {
    const hit = e.target instanceof Element && e.target.closest(HOVER_TARGETS);
    cursor.classList.toggle('is-hover', Boolean(hit));
  });
}

/* ------------------------------------------------------------------------ */
/* Effet magnétique                                                          */
/* ------------------------------------------------------------------------ */
function initMagnetic(gsap) {
  document.querySelectorAll('[data-magnetic]').forEach((el) => {
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
  });
}

/* ------------------------------------------------------------------------ */
/* Cartes : tilt 3D + halo + apparition                                      */
/* ------------------------------------------------------------------------ */
function initTilt(gsap, reduced, canTilt) {
  const cards = gsap.utils.toArray('[data-tilt]');
  if (!cards.length) return;

  const MAX = 12;
  gsap.set(cards, { transformPerspective: 1000 });

  cards.forEach((card) => {
    // Le halo suit la souris dans tous les cas (pas de mouvement de la carte)
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      card.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
      card.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);

      if (!canTilt || !card._revealed) return;
      gsap.to(card, {
        rotationY: (px - 0.5) * 2 * MAX,
        rotationX: -(py - 0.5) * 2 * MAX,
        duration: 0.5,
        ease: 'power3.out',
        overwrite: 'auto',
      });
    });

    card.addEventListener('mouseleave', () => {
      if (!canTilt || !card._revealed) return;
      gsap.to(card, { rotationX: 0, rotationY: 0, duration: 0.9, ease: 'power3.out', overwrite: 'auto' });
    });
  });

  // Apparition au scroll : montée + bascule depuis le bas, en cascade
  if (reduced) {
    cards.forEach((c) => { c._revealed = true; });
    return;
  }
  gsap.from(cards, {
    y: 120,
    rotationX: -45,
    autoAlpha: 0,
    transformOrigin: '50% 100%',
    duration: 1.2,
    stagger: 0.15,
    ease: 'expo.out',
    scrollTrigger: { trigger: cards[0].parentElement, start: 'top 85%' },
    onComplete: () => cards.forEach((c) => { c._revealed = true; }),
  });
}

/* ------------------------------------------------------------------------ */
/* Titres découpés en lettres                                                */
/* ------------------------------------------------------------------------ */
function splitChars(el) {
  const text = el.textContent.replace(/\s+/g, ' ').trim();
  el.setAttribute('aria-label', text);
  el.textContent = '';
  const chars = [];

  text.split(' ').forEach((word, i, all) => {
    // Chaque mot reste insécable ; les lettres sont en inline-block
    const w = document.createElement('span');
    w.className = 'split-word';
    w.setAttribute('aria-hidden', 'true');
    for (const ch of word) {
      const c = document.createElement('span');
      c.className = 'split-char';
      c.textContent = ch;
      w.appendChild(c);
      chars.push(c);
    }
    el.appendChild(w);
    if (i < all.length - 1) el.appendChild(document.createTextNode(' '));
  });
  return chars;
}

function initSplit(gsap, reduced) {
  if (reduced) return; // texte laissé intact, déjà visible
  document.querySelectorAll('[data-split]').forEach((el) => {
    const chars = splitChars(el);
    // Dans la galerie (sticky), on déclenche sur la section elle-même
    const section = el.closest('.showcase');
    gsap.from(chars, {
      y: '0.9em',
      rotationX: -90,
      autoAlpha: 0,
      transformOrigin: '50% 100%',
      transformPerspective: 600,
      duration: 0.9,
      stagger: 0.03,
      ease: 'power3.out',
      scrollTrigger: section
        ? { trigger: section, start: 'top 40%' }
        : { trigger: el, start: 'top 85%' },
    });
  });
}

/* ------------------------------------------------------------------------ */
/* Reveals génériques (hors hero)                                            */
/* ------------------------------------------------------------------------ */
function initReveals(gsap, reduced) {
  if (reduced) return;
  document.querySelectorAll('[data-reveal]').forEach((el) => {
    if (el.closest('#hero')) return; // géré par l'intro
    gsap.from(el, {
      y: 50,
      autoAlpha: 0,
      duration: 1,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%' },
    });
  });
}

/* ------------------------------------------------------------------------ */
/* Compteurs                                                                 */
/* ------------------------------------------------------------------------ */
function initCounters(gsap, ScrollTrigger, reduced) {
  document.querySelectorAll('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count) || 0;
    if (reduced || target === 0) {
      el.textContent = formatNumber(target);
      return;
    }
    const obj = { v: 0 };
    el.textContent = '0';
    ScrollTrigger.create({
      trigger: el,
      start: 'top 85%',
      once: true,
      onEnter: () => {
        gsap.to(obj, {
          v: target,
          duration: 2,
          ease: 'power3.out',
          onUpdate: () => { el.textContent = formatNumber(obj.v); },
        });
      },
    });
  });
}

/* ------------------------------------------------------------------------ */
/* Liens avec les scènes 3D + parallaxe du hero                              */
/* ------------------------------------------------------------------------ */
function initScrollScenes(gsap, ScrollTrigger, hero, showcase, reduced) {
  // Progression de toute la page, lissée par le scrub
  const proxy = { p: 0 };
  gsap.to(proxy, {
    p: 1,
    ease: 'none',
    scrollTrigger: {
      trigger: document.documentElement,
      start: 'top top',
      end: 'bottom bottom',
      scrub: reduced ? true : 1,
    },
    onUpdate: () => hero?.setScroll?.(proxy.p),
  });

  // Progression dans la galerie
  const galerie = document.getElementById('galerie');
  if (galerie) {
    ScrollTrigger.create({
      trigger: galerie,
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
      onUpdate: (self) => showcase?.setProgress?.(self.progress),
      onRefresh: (self) => showcase?.setProgress?.(self.progress),
    });
  }

  // Le titre du hero part en parallaxe et s'efface
  if (reduced) return;
  const heroEl = document.getElementById('hero');
  const title = document.querySelector('.hero-title');
  if (heroEl && title) {
    gsap.to(title, {
      yPercent: -35,
      autoAlpha: 0,
      ease: 'none',
      scrollTrigger: { trigger: heroEl, start: 'top top', end: 'bottom top', scrub: true },
    });
  }
}

/* ------------------------------------------------------------------------ */
/* Navigation : masquage au scroll                                           */
/* ------------------------------------------------------------------------ */
function initNav() {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  let lastY = window.scrollY;
  let ticking = false;

  const update = () => {
    const y = window.scrollY;
    nav.classList.toggle('is-scrolled', y > 20);
    if (y > lastY + 4 && y > 120) nav.classList.add('is-hidden');
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

  // Réaffiche la nav quand un lien reçoit le focus clavier
  nav.addEventListener('focusin', () => nav.classList.remove('is-hidden'));
  update();
}

/* ------------------------------------------------------------------------ */
/* Ancres : défilement fluide                                                */
/* ------------------------------------------------------------------------ */
function initAnchors(reduced) {
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href').slice(1);
      const target = id && document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      history.replaceState(null, '', `#${id}`);
    });
  });
}

/* ------------------------------------------------------------------------ */
/* Marquee : contenu doublé pour une boucle sans couture                     */
/* ------------------------------------------------------------------------ */
function initMarquee() {
  const marquee = document.querySelector('.marquee');
  const track = marquee?.querySelector('.marquee-track');
  if (!track || track.dataset.cloned) return;
  marquee.setAttribute('aria-hidden', 'true'); // purement décoratif
  track.innerHTML += track.innerHTML;
  track.dataset.cloned = 'true';
}

/* ------------------------------------------------------------------------ */
/* Repli sans GSAP : alimente quand même les scènes 3D                       */
/* ------------------------------------------------------------------------ */
function initScrollFallback(hero, showcase) {
  const galerie = document.getElementById('galerie');
  let ticking = false;
  const update = () => {
    hero?.setScroll?.(pageProgress());
    if (galerie) showcase?.setProgress?.(sectionProgress(galerie));
    ticking = false;
  };
  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
}
