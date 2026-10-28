// Animations de l'interface : loader, curseur, reveals, scroll, interactions.
// GSAP et ScrollTrigger sont chargés en global (scripts defer).

// Formate un entier avec des espaces pour les milliers : 4000 -> "4 000"
function formatNumber(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// Progression du scroll de toute la page (0..1)
function pageProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
}

// Recalcule ScrollTrigger après un changement de hauteur (accordéons…)
let refreshTimer = 0;
function queueRefresh(delay = 700) {
  const ST = window.ScrollTrigger;
  if (!ST) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => ST.refresh(), delay);
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

  // Nav, curseur et effet magnétique sont gérés par common.js
  initAnchors(reduced);
  initMarquee();
  initLogos();
  initPageIndicators();
  initServicesAccordion();
  initFaq(reduced);
  initTestimonials(reduced);

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

  // L'épinglage du processus doit être créé avant les déclencheurs situés en dessous
  initProcess(gsap, reduced);
  initManifesto(gsap, reduced);
  initServicesVisual(gsap, finePointer && !reduced);
  initTilt(gsap, reduced, finePointer && !reduced);
  initSplit(gsap, reduced);
  initReveals(gsap, reduced);
  initStagger(gsap, reduced);
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
  // Une cascade par grille de cartes (univers, projets…)
  const groups = new Map();
  cards.forEach((card) => {
    const parent = card.parentElement;
    if (!groups.has(parent)) groups.set(parent, []);
    groups.get(parent).push(card);
  });
  groups.forEach((list, parent) => {
    gsap.from(list, {
      y: 120,
      rotationX: -45,
      autoAlpha: 0,
      transformOrigin: '50% 100%',
      duration: 1.2,
      stagger: 0.15,
      ease: 'expo.out',
      scrollTrigger: { trigger: parent, start: 'top 85%' },
      onComplete: () => list.forEach((c) => { c._revealed = true; }),
    });
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

/* ------------------------------------------------------------------------ */
/* Cascades génériques : les enfants de [data-stagger] apparaissent en série */
/* ------------------------------------------------------------------------ */
function initStagger(gsap, reduced) {
  if (reduced) return;
  document.querySelectorAll('[data-stagger]').forEach((el) => {
    gsap.from(el.children, {
      y: 60,
      autoAlpha: 0,
      duration: 1,
      stagger: 0.1,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 85%' },
    });
  });
}

/* ------------------------------------------------------------------------ */
/* Manifeste : les mots s'allument un à un au scroll                         */
/* ------------------------------------------------------------------------ */
function splitWords(root) {
  const words = [];
  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          // Les espaces (insécables compris) restent du texte brut
          if (/^\s+$/.test(part)) {
            frag.appendChild(document.createTextNode(part));
            return;
          }
          const w = document.createElement('span');
          w.className = 'home-mword';
          w.textContent = part;
          frag.appendChild(w);
          words.push(w);
        });
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child);
        if (child.classList.contains('home-hl')) child.classList.add('is-split');
      }
    });
  };
  walk(root);
  return words;
}

function initManifesto(gsap, reduced) {
  if (reduced) return; // texte laissé pleinement lisible
  document.querySelectorAll('[data-words]').forEach((el) => {
    const words = splitWords(el);
    if (!words.length) return;
    gsap.set(words, { opacity: 0.15 });
    gsap.to(words, {
      opacity: 1,
      ease: 'none',
      stagger: 0.1,
      scrollTrigger: { trigger: el, start: 'top 78%', end: 'bottom 45%', scrub: 0.6 },
    });
  });
}

/* ------------------------------------------------------------------------ */
/* Services : accordéon (tous écrans) + visuel qui suit la souris (desktop)  */
/* ------------------------------------------------------------------------ */
function initServicesAccordion() {
  const list = document.getElementById('home-services-list');
  if (!list) return;
  const items = [...list.querySelectorAll('.home-service')];
  list.classList.add('is-enhanced');

  const setOpen = (item, open) => {
    item.classList.toggle('is-open', open);
    item.querySelector('.home-service-head')?.setAttribute('aria-expanded', String(open));
  };

  items.forEach((item) => {
    item.querySelector('.home-service-head')?.addEventListener('click', () => {
      const open = !item.classList.contains('is-open');
      // Un seul service ouvert à la fois
      items.forEach((other) => { if (other !== item) setOpen(other, false); });
      setOpen(item, open);
      queueRefresh();
    });
  });
}

function initServicesVisual(gsap, enabled) {
  const section = document.getElementById('services');
  const visual = document.getElementById('home-services-visual');
  const list = document.getElementById('home-services-list');
  if (!enabled || !section || !visual || !list) return;

  gsap.set(visual, { xPercent: -50, yPercent: -50, scale: 0.3, autoAlpha: 0 });
  const qx = gsap.quickTo(visual, 'x', { duration: 0.7, ease: 'power3' });
  const qy = gsap.quickTo(visual, 'y', { duration: 0.7, ease: 'power3' });
  const local = (e) => {
    const r = section.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  list.addEventListener('mouseenter', (e) => {
    const [x, y] = local(e);
    gsap.set(visual, { x, y }); // pas de trajet depuis le coin
    gsap.to(visual, { autoAlpha: 1, scale: 1, duration: 0.6, ease: 'expo.out', overwrite: 'auto' });
  });
  list.addEventListener('mouseleave', () => {
    gsap.to(visual, { autoAlpha: 0, scale: 0.3, duration: 0.5, ease: 'power3.in', overwrite: 'auto' });
  });
  list.addEventListener('mousemove', (e) => {
    const [x, y] = local(e);
    qx(x);
    qy(y);
  });

  // Change de teinte selon la ligne survolée, avec un petit rebond
  list.querySelectorAll('.home-service').forEach((item) => {
    item.addEventListener('mouseenter', () => {
      if (visual.dataset.grad === item.dataset.grad) return;
      visual.dataset.grad = item.dataset.grad || '';
      gsap.fromTo(visual, { rotation: -25 }, { rotation: 0, duration: 0.9, ease: 'elastic.out(1, 0.5)' });
    });
  });
}

/* ------------------------------------------------------------------------ */
/* Processus : défilement horizontal épinglé (desktop uniquement)            */
/* ------------------------------------------------------------------------ */
function initProcess(gsap, reduced) {
  const section = document.getElementById('processus');
  const pin = document.getElementById('home-process-pin');
  const track = document.getElementById('home-process-track');
  const fill = document.getElementById('home-process-fill');
  const current = document.getElementById('home-process-current');
  if (!section || !pin || !track || reduced) return; // pile verticale

  const steps = [...track.children];
  const mm = gsap.matchMedia();

  mm.add('(min-width: 901px) and (min-height: 600px)', () => {
    section.classList.add('is-horizontal');
    const distance = () => Math.max(0, track.scrollWidth - pin.clientWidth);
    let active = -1;

    const setActive = (i) => {
      if (i === active) return;
      active = i;
      steps.forEach((s, k) => s.classList.toggle('is-current', k === i));
      if (current) current.textContent = String(i + 1).padStart(2, '0');
    };
    setActive(0);

    gsap.to(track, {
      x: () => -distance(),
      ease: 'none',
      scrollTrigger: {
        trigger: pin,
        start: 'top top',
        end: () => `+=${distance()}`,
        pin: true,
        scrub: 0.8,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          if (fill) fill.style.transform = `scaleX(${self.progress.toFixed(4)})`;
          setActive(Math.min(steps.length - 1, Math.round(self.progress * (steps.length - 1))));
        },
      },
    });

    // Nettoyage au retour en mobile : pile verticale classique
    return () => {
      section.classList.remove('is-horizontal');
      steps.forEach((s) => s.classList.remove('is-current'));
      if (fill) fill.style.transform = '';
    };
  });
}

/* ------------------------------------------------------------------------ */
/* Témoignages : carrousel auto, pause au survol/focus, clavier, swipe       */
/* ------------------------------------------------------------------------ */
function initTestimonials(reduced) {
  const root = document.getElementById('home-testi');
  const viewport = document.getElementById('home-testi-viewport');
  if (!root || !viewport) return;
  const slides = [...viewport.querySelectorAll('.home-testi-slide')];
  const dots = [...root.querySelectorAll('.home-testi-dot')];
  const toggle = root.querySelector('[data-testi-toggle]');
  const n = slides.length;
  if (n < 2) return;

  const autoplay = !reduced;
  let index = 0;
  let userPaused = false;
  let hovered = false;
  let focused = false;
  let inView = true;

  const go = (i) => {
    index = (i + n) % n;
    slides.forEach((s, k) => {
      const on = k === index;
      s.classList.toggle('is-active', on);
      s.setAttribute('aria-hidden', String(!on));
    });
    dots.forEach((d, k) => {
      d.classList.toggle('is-active', k === index);
      if (k === index) d.setAttribute('aria-current', 'true');
      else d.removeAttribute('aria-current');
    });
  };

  const sync = () => {
    root.classList.toggle('is-paused', userPaused || hovered || focused || !inView);
    // Annonces vocales seulement quand l'utilisateur pilote
    viewport.setAttribute('aria-live', autoplay && !userPaused ? 'off' : 'polite');
    if (toggle) {
      toggle.textContent = userPaused ? 'Lecture' : 'Pause';
      toggle.setAttribute('aria-label', userPaused
        ? 'Relancer le défilement automatique'
        : 'Mettre en pause le défilement automatique');
    }
  };

  root.querySelector('[data-testi-prev]')?.addEventListener('click', () => go(index - 1));
  root.querySelector('[data-testi-next]')?.addEventListener('click', () => go(index + 1));
  dots.forEach((d, k) => d.addEventListener('click', () => go(k)));

  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); }
  });

  // Swipe horizontal (tactile)
  let startX = null;
  viewport.addEventListener('pointerdown', (e) => { startX = e.clientX; });
  viewport.addEventListener('pointerup', (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 50) go(index + (dx < 0 ? 1 : -1));
  });
  viewport.addEventListener('pointercancel', () => { startX = null; });

  go(0);

  if (!autoplay) {
    if (toggle) toggle.hidden = true;
    sync();
    return;
  }

  // La jauge CSS du point actif sert de minuteur : à sa fin, on avance
  root.classList.add('is-autoplay');
  root.addEventListener('animationend', (e) => {
    if (e.animationName === 'home-testi-progress') go(index + 1);
  });

  root.addEventListener('mouseenter', () => { hovered = true; sync(); });
  root.addEventListener('mouseleave', () => { hovered = false; sync(); });
  root.addEventListener('focusin', () => { focused = true; sync(); });
  root.addEventListener('focusout', (e) => {
    if (!root.contains(e.relatedTarget)) { focused = false; sync(); }
  });
  toggle?.addEventListener('click', () => { userPaused = !userPaused; sync(); });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      inView = entries.some((en) => en.isIntersecting);
      sync();
    }).observe(root);
  }
  sync();
}

/* ------------------------------------------------------------------------ */
/* FAQ : ouverture/fermeture animée des <details>                            */
/* ------------------------------------------------------------------------ */
function initFaq(reduced) {
  document.querySelectorAll('.home-faq-item').forEach((details) => {
    const summary = details.querySelector('summary');
    if (!summary) return;
    details.addEventListener('toggle', () => queueRefresh());
    if (reduced || typeof details.animate !== 'function') return; // comportement natif

    let anim = null;
    let closing = false;

    summary.addEventListener('click', (e) => {
      e.preventDefault();
      const start = details.offsetHeight;
      anim?.cancel();
      const opening = !details.open || closing;
      let end;
      if (opening) {
        closing = false;
        details.open = true;
        end = details.offsetHeight;
      } else {
        closing = true;
        const borders = details.offsetHeight - details.clientHeight;
        end = summary.offsetHeight + borders;
      }
      anim = details.animate(
        { height: [`${start}px`, `${end}px`] },
        { duration: 500, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
      );
      anim.onfinish = () => {
        anim = null;
        if (closing) details.open = false;
        closing = false;
      };
    });
  });
}

/* ------------------------------------------------------------------------ */
/* Bandeau clients : contenu doublé (clones masqués aux lecteurs d'écran)    */
/* ------------------------------------------------------------------------ */
function initLogos() {
  document.querySelectorAll('[data-logos]').forEach((wrap) => {
    const track = wrap.querySelector('.home-logos-track');
    if (!track || wrap.classList.contains('is-ready')) return;
    [...track.children].forEach((li) => {
      const clone = li.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      track.appendChild(clone);
    });
    wrap.classList.add('is-ready');
  });
}

/* ------------------------------------------------------------------------ */
/* Barre de lecture + indicateur de section courante                         */
/* ------------------------------------------------------------------------ */
function initPageIndicators() {
  const bar = document.getElementById('home-progress-bar');
  const nav = document.getElementById('home-sectionnav');
  const links = nav ? [...nav.querySelectorAll('a[href^="#"]')] : [];
  const targets = links.map((a) => document.getElementById(a.getAttribute('href').slice(1)));
  if (!bar && !links.length) return;

  let active = -1;
  let ticking = false;

  const update = () => {
    ticking = false;
    if (bar) bar.style.transform = `scaleX(${pageProgress().toFixed(4)})`;
    // Section courante : la dernière dont le haut a passé 40 % de l'écran
    const line = window.innerHeight * 0.4;
    let idx = 0;
    targets.forEach((t, i) => {
      if (t && t.getBoundingClientRect().top <= line) idx = i;
    });
    if (idx !== active) {
      active = idx;
      links.forEach((a, i) => {
        if (i === idx) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    }
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
