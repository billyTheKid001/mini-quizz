// Page Projets : hero en lettres, carrousel 3D en CSS, index filtrable (FLIP),
// modale de détail avec un aperçu Three.js partagé, chiffres et reveals.
// Three.js est importé à la demande (première ouverture de fiche) : la page
// reste utilisable même si le CDN ne répond pas.
import { initCommon, bindMagnetic } from './common.js';

/* ------------------------------------------------------------------------ */
/* Données                                                                   */
/* ------------------------------------------------------------------------ */
const CATEGORIES = {
  web: 'Web immersif',
  installation: 'Installation',
  jeu: 'Jeu',
  configurateur: 'Configurateur',
};

// pattern = visuel CSS de la carte, shape = objet 3D de la modale
const PROJECTS = [
  {
    slug: 'nebuleuse',
    title: 'Nébuleuse',
    cat: 'web',
    year: 2026,
    client: 'Musée des Sciences du Littoral',
    role: 'Concept, direction artistique, développement WebGL',
    duration: '14 semaines',
    teaser: 'Quatre siècles d\'astronomie rangés dans une galaxie navigable.',
    description: 'Une galaxie navigable pour raconter quatre siècles d\'astronomie. Chaque étoile est une archive : on s\'en approche, on tourne autour, on écoute le récit associé. L\'ensemble tient en 2 Mo et s\'affiche en moins de trois secondes, même sur un téléphone d\'entrée de gamme.',
    tech: ['Three.js', 'GLSL', 'GSAP', 'Web Audio', 'Compression Draco'],
    results: [
      { value: '+212 %', label: 'de temps passé sur le site' },
      { value: '1,1 M', label: 'visites en trois mois' },
      { value: '60 ips', label: 'sur mobile milieu de gamme' },
    ],
    colors: ['#7c5cff', '#00e5ff', '#140b3a'],
    pattern: 'orbs',
    shape: 'knot',
  },
  {
    slug: 'atlas-sonore',
    title: 'Atlas Sonore',
    cat: 'installation',
    year: 2025,
    client: 'Fondation Ondes & Territoires',
    role: 'Scénographie interactive, shaders, intégration des capteurs',
    duration: '10 semaines',
    teaser: 'Une sphère de quatre mètres qui se déforme au son des voix.',
    description: 'Une sphère de quatre mètres qui réagit aux voix des visiteurs. Chaque son déforme la surface et laisse une trace lumineuse qui persiste jusqu\'à la fermeture. Le soir, la sphère rejoue la mémoire sonore de la journée en accéléré.',
    tech: ['Three.js', 'WebGL 2', 'Web Audio', 'Capteurs de profondeur', 'Node.js'],
    results: [
      { value: '48 000', label: 'visiteurs en six semaines' },
      { value: '22 min', label: 'de visite moyenne' },
      { value: '3', label: 'villes d\'itinérance' },
    ],
    colors: ['#ff3d81', '#ffb547', '#3a0a1f'],
    pattern: 'rings',
    shape: 'ico',
  },
  {
    slug: 'gravite-zero',
    title: 'Gravité Zéro',
    cat: 'jeu',
    year: 2025,
    client: 'Observatoire Cap Horizon',
    role: 'Game design, développement, physique orbitale',
    duration: '12 semaines',
    teaser: 'Piloter une sonde en jouant avec la gravité des planètes.',
    description: 'Un jeu de navigateur où l\'on pilote une sonde entre des astéroïdes en exploitant l\'attraction des planètes. Conçu avec des médiateurs scientifiques, il fait comprendre les trajectoires orbitales sans une seule équation à l\'écran.',
    tech: ['Three.js', 'Physique maison', 'GSAP', 'PWA', 'Manette & tactile'],
    results: [
      { value: '380 000', label: 'parties jouées' },
      { value: '4,7 / 5', label: 'note moyenne des joueurs' },
      { value: '9 min', label: 'de session moyenne' },
    ],
    colors: ['#00e5ff', '#7cffb2', '#04202a'],
    pattern: 'grid',
    shape: 'octa',
  },
  {
    slug: 'lumen',
    title: 'Lumen',
    cat: 'configurateur',
    year: 2026,
    client: 'Ateliers Cyclo Nord',
    role: 'UX, rendu temps réel, connexion à la chaîne de fabrication',
    duration: '16 semaines',
    teaser: 'Un vélo sur mesure configuré pièce par pièce, en temps réel.',
    description: 'Un configurateur de vélo sur mesure : cadre, couleurs, roues, éclairage intégré. Le rendu se met à jour à chaque choix et génère automatiquement la fiche de fabrication envoyée à l\'atelier, sans ressaisie.',
    tech: ['Three.js', 'PBR', 'Vue', 'API atelier', 'Rendu hors ligne'],
    results: [
      { value: '+38 %', label: 'de taux de conversion' },
      { value: '−60 %', label: 'de retours produits' },
      { value: '12 000', label: 'configurations par mois' },
    ],
    colors: ['#ffd166', '#ff3d81', '#2a1a05'],
    pattern: 'stripes',
    shape: 'torus',
  },
  {
    slug: 'recif',
    title: 'Récif',
    cat: 'installation',
    year: 2024,
    client: 'Aquarium municipal de Port-Clair',
    role: 'Création générative, simulation de particules, maintenance',
    duration: '18 semaines',
    teaser: 'Un mur de douze mètres où un récif génératif pousse en direct.',
    description: 'Un mur de douze mètres où un récif corallien génératif pousse en direct. Les mouvements des enfants attirent des bancs de poissons composés de 30 000 particules. Le récif ne repasse jamais deux fois par le même état.',
    tech: ['WebGL', 'GPGPU', 'Caméras de suivi', 'Électron', 'Supervision à distance'],
    results: [
      { value: '30 000', label: 'particules simulées en direct' },
      { value: '250 000', label: 'visiteurs par an' },
      { value: '0', label: 'panne en dix-huit mois' },
    ],
    colors: ['#00e5ff', '#3d7cff', '#021a33'],
    pattern: 'dots',
    shape: 'points',
  },
  {
    slug: 'prisme',
    title: 'Prisme',
    cat: 'web',
    year: 2024,
    client: 'Éditions Les Facettes',
    role: 'Direction artistique, motion design, développement front',
    duration: '8 semaines',
    teaser: 'Une collection de livres d\'art décomposée comme la lumière.',
    description: 'Le site de lancement d\'une collection de livres d\'art : chaque ouvrage est un prisme qui décompose la lumière en chapitres. Le défilement pilote la caméra comme un travelling de cinéma, du premier rayon à la dernière page.',
    tech: ['Three.js', 'GSAP ScrollTrigger', 'GLSL', 'Astro'],
    results: [
      { value: '+175 %', label: 'de précommandes' },
      { value: '4 min 30', label: 'de visite moyenne' },
      { value: '98', label: 'de score de performance' },
    ],
    colors: ['#b388ff', '#ff3d81', '#1c0b2e'],
    pattern: 'conic',
    shape: 'prism',
  },
  {
    slug: 'orbite-express',
    title: 'Orbite Express',
    cat: 'jeu',
    year: 2026,
    client: 'Festival Jeux & Sciences',
    role: 'Concept, développement multijoueur local, habillage sonore',
    duration: '9 semaines',
    teaser: 'Livraisons interplanétaires en parties de deux minutes.',
    description: 'Un jeu de livraison interplanétaire en parties de deux minutes, jouable à huit sur un même écran avec son téléphone comme manette. Pensé pour occuper les files d\'attente du festival, il est devenu sa mascotte officielle.',
    tech: ['Three.js', 'WebSocket', 'Web Audio', 'Manettes mobiles'],
    results: [
      { value: '65 000', label: 'parties en quatre jours' },
      { value: '8', label: 'joueurs simultanés' },
      { value: '2 min', label: 'par partie, pas une de plus' },
    ],
    colors: ['#7c5cff', '#ff8a3d', '#1a0d33'],
    pattern: 'waves',
    shape: 'rings',
  },
  {
    slug: 'monolithe',
    title: 'Monolithe',
    cat: 'configurateur',
    year: 2025,
    client: 'Atelier Brut Mobilier',
    role: 'Configurateur 3D, réalité augmentée, intégration e-commerce',
    duration: '13 semaines',
    teaser: 'Des étagères modulaires assemblées dans sa propre pièce.',
    description: 'Un configurateur d\'étagères modulaires en béton et en chêne. On assemble les blocs dans une pièce reconstituée à ses dimensions, on vérifie les proportions en réalité augmentée, puis on commande la liste exacte des pièces.',
    tech: ['Three.js', 'WebXR', 'Contraintes d\'assemblage', 'API e-commerce'],
    results: [
      { value: '+52 %', label: 'de panier moyen' },
      { value: '3 s', label: 'de chargement initial' },
      { value: '18 000', label: 'aménagements sauvegardés' },
    ],
    colors: ['#dcdcff', '#00e5ff', '#10121c'],
    pattern: 'blocks',
    shape: 'monolith',
  },
];

const N = PROJECTS.length;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/* ------------------------------------------------------------------------ */
/* Utilitaires                                                               */
/* ------------------------------------------------------------------------ */
const $ = (sel, root = document) => root.querySelector(sel);
const pad = (n) => String(n).padStart(2, '0');
const mod = (n, m) => ((n % m) + m) % m;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Les textes viennent de nos données, mais on échappe quand même
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;',
}[c]));

// Visuel génératif CSS d'un projet (dégradés + forme selon le motif)
function visualHTML(p, extra = '') {
  const [c1, c2, c3] = p.colors;
  return `<span class="pv pv--${p.pattern} ${extra}" style="--c1:${c1};--c2:${c2};--c3:${c3}" aria-hidden="true">`
    + '<span class="pv-shape"></span><span class="pv-sheen"></span></span>';
}

/* ------------------------------------------------------------------------ */
/* Hero : titre lettre par lettre                                            */
/* ------------------------------------------------------------------------ */
function initHero() {
  const title = $('[data-letters]');
  if (!title) return;
  const text = title.textContent.replace(/\s+/g, ' ').trim();
  title.textContent = '';

  // Texte lisible par les lecteurs d'écran, lettres décoratives masquées
  const sr = document.createElement('span');
  sr.className = 'pj-sr';
  sr.textContent = text;
  const visual = document.createElement('span');
  visual.setAttribute('aria-hidden', 'true');

  let i = 0;
  text.split(' ').forEach((word) => {
    const w = document.createElement('span');
    w.className = 'pj-word';
    for (const ch of word) {
      const c = document.createElement('span');
      c.className = 'pj-char';
      c.textContent = ch;
      c.style.setProperty('--i', String(i++));
      w.appendChild(c);
    }
    visual.appendChild(w);
  });
  title.append(sr, visual);
  title.classList.add('is-split');
}

/* ------------------------------------------------------------------------ */
/* Compteurs (hero + chiffres)                                               */
/* ------------------------------------------------------------------------ */
function initCounters() {
  const els = document.querySelectorAll('[data-count]');
  if (!els.length) return;

  const format = (el, v) => {
    const decimals = Number(el.dataset.decimals || 0);
    const padTo = Number(el.dataset.pad || 0);
    let s = v.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    if (padTo) s = s.padStart(padTo, '0');
    return s;
  };

  const run = (el) => {
    const to = Number(el.dataset.count);
    if (reduced) { el.textContent = format(el, to); return; }
    const t0 = performance.now();
    const dur = 1600;
    const step = (now) => {
      const k = Math.min((now - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - k, 4);
      el.textContent = format(el, to * eased);
      if (k < 1) requestAnimationFrame(step);
    };
    el.textContent = format(el, 0);
    requestAnimationFrame(step);
  };

  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      run(e.target);
    });
  }, { threshold: 0.6 });
  els.forEach((el) => io.observe(el));
}

/* ------------------------------------------------------------------------ */
/* Apparitions au scroll                                                     */
/* ------------------------------------------------------------------------ */
function initReveal() {
  if (reduced || !('IntersectionObserver' in window)) return;
  const els = document.querySelectorAll('[data-reveal]');
  document.documentElement.classList.add('pj-reveal-on');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
  els.forEach((el) => io.observe(el));
}

// Petits effets liés au scroll (optionnels, seulement avec GSAP)
function initScrollFx() {
  const { gsap, ScrollTrigger } = window;
  if (!gsap || !ScrollTrigger || reduced) return;
  gsap.registerPlugin(ScrollTrigger);

  gsap.to('.pj-hero-title', {
    yPercent: 25,
    opacity: 0.15,
    ease: 'none',
    scrollTrigger: { trigger: '.pj-hero', start: 'top top', end: 'bottom top', scrub: true },
  });

  const steps = $('.pj-steps');
  if (steps) {
    gsap.fromTo(steps, { '--line': 0 }, {
      '--line': 1,
      ease: 'none',
      scrollTrigger: { trigger: steps, start: 'top 75%', end: 'bottom 55%', scrub: true },
    });
  }
}

/* ------------------------------------------------------------------------ */
/* Carrousel 3D                                                              */
/* ------------------------------------------------------------------------ */
function initRing(openProject) {
  const stage = $('#pj-ring-stage');
  const ring = $('#pj-ring');
  if (!stage || !ring) return;

  const STEP = 360 / N;
  const AUTO_SPEED = 6; // degrés par seconde
  const DRAG_SENS = 0.3; // degrés par pixel

  ring.innerHTML = PROJECTS.map((p, i) => `
    <div class="pj-rcard" data-index="${i}">
      <button class="pj-rcard-face" type="button" data-index="${i}" tabindex="-1" aria-haspopup="dialog"
        aria-label="${esc(`${p.title} — ${CATEGORIES[p.cat]}, ${p.year}. Ouvrir la fiche`)}">
        ${visualHTML(p)}
        <span class="pj-rcard-top"><span>${pad(i + 1)}</span><span>${esc(CATEGORIES[p.cat])}</span></span>
        <span class="pj-rcard-bottom">
          <span class="pj-rcard-title">${esc(p.title)}</span>
          <span class="pj-rcard-year">${p.year}</span>
        </span>
      </button>
      <span class="pj-rcard-back" aria-hidden="true">${visualHTML(p, 'pv--muted')}<span class="pj-rcard-back-num">${pad(i + 1)}</span></span>
    </div>`).join('');

  // Conteneurs 3D (positionnés en cercle) et boutons de face (focus, clic)
  const cards = [...ring.children];
  const faces = cards.map((c) => c.querySelector('.pj-rcard-face'));
  const dotsWrap = $('#pj-ring-dots');
  dotsWrap.innerHTML = PROJECTS.map((p, i) => `<button class="pj-dot" type="button" data-index="${i}" aria-label="${esc(`Projet ${i + 1} : ${p.title}`)}"></button>`).join('');
  const dots = [...dotsWrap.children];
  const numEl = $('#pj-ring-num');
  const titleEl = $('#pj-ring-title');
  const catEl = $('#pj-ring-cat');
  const live = $('#pj-ring-live');
  const pauseBtn = $('#pj-ring-pause');

  let angle = 0;
  let target = null;
  let vel = 0;
  let radius = 300;
  let front = -1;
  let idle = 3; // l'autorotation démarre tout de suite
  let hover = false;
  let focusIn = false;
  let paused = reduced;
  let drag = null;
  let dragging = false;
  let dragEnd = 0;
  let announce = false;
  let visible = false;
  let raf = 0;
  let last = 0;

  const norm = (a) => mod(a + 180, 360) - 180;
  const snap = (a) => Math.round(a / STEP) * STEP;

  const layout = () => {
    const w = cards[0].offsetWidth || 260;
    radius = Math.round((w / 2) / Math.tan(Math.PI / N) * 1.16);
    cards.forEach((c, i) => {
      c.style.transform = `rotateY(${i * STEP}deg) translateZ(${radius}px)`;
    });
    render(true);
  };

  const setFront = (i) => {
    front = i;
    const p = PROJECTS[i];
    cards.forEach((c, k) => {
      c.classList.toggle('is-front', k === i);
      faces[k].tabIndex = k === i ? 0 : -1;
    });
    dots.forEach((d, k) => {
      if (k === i) d.setAttribute('aria-current', 'true');
      else d.removeAttribute('aria-current');
    });
    numEl.textContent = `${pad(i + 1)} / ${pad(N)}`;
    titleEl.textContent = p.title;
    catEl.textContent = `${CATEGORIES[p.cat]} · ${p.year}`;
    // On n'annonce que les changements provoqués par l'utilisateur
    if (announce) live.textContent = `Projet ${i + 1} sur ${N} : ${p.title}, ${CATEGORIES[p.cat]}, ${p.year}.`;
  };

  let rendered = NaN;
  const render = (force = false) => {
    if (!force && angle === rendered) return; // rien n'a bougé
    rendered = angle;
    ring.style.transform = `translateZ(${-radius}px) rotateY(${angle}deg)`;
    cards.forEach((c, i) => {
      const rel = norm(angle + i * STEP);
      c.style.setProperty('--face', ((Math.cos(rel * Math.PI / 180) + 1) / 2).toFixed(3));
    });
    const f = mod(Math.round(-angle / STEP), N);
    if (f !== front) setFront(f);
  };

  // Angle le plus proche qui amène la carte i de face
  const goIndex = (i, focus = false) => {
    target = angle + norm(-i * STEP - angle);
    vel = 0;
    idle = 0;
    announce = true;
    if (reduced) { angle = target; target = null; render(true); }
    if (focus) {
      faces.forEach((f, k) => { f.tabIndex = k === i ? 0 : -1; });
      faces[i].focus({ preventScroll: true });
    }
    wake();
  };
  const go = (dir, focus = false) => {
    const base = target ?? snap(angle);
    goIndex(mod(Math.round(-base / STEP) + dir, N), focus);
  };

  const tick = (now) => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!dragging) {
      idle += dt;
      if (target !== null) {
        const d = target - angle;
        angle += d * (1 - Math.exp(-dt * 7));
        if (Math.abs(d) < 0.02) { angle = target; target = null; }
      } else if (vel !== 0) {
        // Inertie puis aimantation sur la carte la plus proche
        angle += vel * dt;
        vel *= Math.exp(-dt * 2.8);
        if (Math.abs(vel) < 5) { vel = 0; target = snap(angle); }
      } else if (!paused && !hover && !focusIn && idle > 2.5) {
        announce = false;
        angle -= AUTO_SPEED * dt;
      }
    }
    render();
  };

  const wake = () => {
    if (raf || !visible) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };
  const sleep = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };

  /* --- Glisser (souris + tactile) ----------------------------------------- */
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, a: angle, lastX: e.clientX, lastT: performance.now(), id: e.pointerId, moved: false };
  });

  stage.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved) {
      if (Math.abs(dx) < 6) return;
      // Geste plutôt vertical au doigt : on laisse défiler la page
      if (e.pointerType !== 'mouse' && Math.abs(e.clientY - drag.y) > Math.abs(dx)) { drag = null; return; }
      drag.moved = true;
      dragging = true;
      target = null;
      vel = 0;
      announce = true;
      stage.classList.add('is-dragging');
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* pointeur déjà relâché */ }
    }
    const now = performance.now();
    const inst = ((e.clientX - drag.lastX) * DRAG_SENS) / Math.max(now - drag.lastT, 1) * 1000;
    vel = vel * 0.6 + inst * 0.4;
    angle = drag.a + dx * DRAG_SENS;
    drag.lastX = e.clientX;
    drag.lastT = now;
    idle = 0;
  });

  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moved) {
      dragEnd = performance.now();
      // Vitesse périmée si le doigt s'est arrêté avant de lâcher
      if (dragEnd - drag.lastT > 90) vel = 0;
      vel = clamp(vel, -720, 720);
      if (Math.abs(vel) < 5) { vel = 0; target = snap(angle); }
      stage.classList.remove('is-dragging');
    }
    dragging = false;
    drag = null;
    idle = 0;
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  /* --- Molette quand l'anneau est survolé ---------------------------------- */
  stage.addEventListener('wheel', (e) => {
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!d) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : 1;
    target = null;
    announce = true;
    vel = clamp(vel - d * unit * 1.5, -600, 600);
    if (vel === 0) vel = -Math.sign(d) * 6;
    idle = 0;
  }, { passive: false });

  /* --- Survol, focus et clavier ------------------------------------------- */
  stage.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    hover = true;
    if (target === null && vel === 0 && !dragging) target = snap(angle);
  });
  stage.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') hover = false;
  });
  stage.addEventListener('focusin', () => {
    focusIn = true;
    if (target === null && vel === 0) target = snap(angle);
  });
  stage.addEventListener('focusout', (e) => {
    if (!stage.contains(e.relatedTarget)) focusIn = false;
  });

  stage.addEventListener('keydown', (e) => {
    const keys = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 };
    if (e.key in keys) {
      e.preventDefault();
      go(keys[e.key], true);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      goIndex(e.key === 'Home' ? 0 : N - 1, true);
    }
  });

  ring.addEventListener('click', (e) => {
    const card = e.target instanceof Element && e.target.closest('.pj-rcard-face');
    if (!card) return;
    if (performance.now() - dragEnd < 300) return;
    const i = Number(card.dataset.index);
    // Carte de face (ou activation clavier / lecteur d'écran) : on ouvre
    if (i === front || e.detail === 0) openProject(i, card);
    else goIndex(i);
  });

  $('#pj-ring-prev').addEventListener('click', () => go(-1));
  $('#pj-ring-next').addEventListener('click', () => go(1));
  dotsWrap.addEventListener('click', (e) => {
    const dot = e.target instanceof Element && e.target.closest('.pj-dot');
    if (dot) goIndex(Number(dot.dataset.index));
  });

  const setPaused = (v) => {
    paused = v;
    pauseBtn.setAttribute('aria-pressed', String(v));
    pauseBtn.querySelector('.pj-pause-label').textContent = v ? 'Lecture' : 'Pause';
    pauseBtn.setAttribute('aria-label', v ? 'Relancer la rotation automatique' : 'Mettre en pause la rotation automatique');
    if (v && target === null && vel === 0) target = snap(angle);
  };
  setPaused(paused);
  pauseBtn.addEventListener('click', () => setPaused(!paused));

  /* --- Cycle de vie ------------------------------------------------------- */
  layout();
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 120);
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) wake(); else sleep();
    }, { rootMargin: '80px 0px' }).observe(stage);
  } else {
    visible = true;
    wake();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) sleep(); else wake();
  });

  // Exposé pour la modale : recentrer l'anneau sur le dernier projet vu
  return { show: (i) => { const keep = announce; goIndex(i); announce = keep; } };
}

/* ------------------------------------------------------------------------ */
/* Index filtrable avec animation FLIP                                       */
/* ------------------------------------------------------------------------ */
function initGrid(openProject) {
  const grid = $('#pj-grid');
  const filters = $('#pj-filters');
  const status = $('#pj-grid-status');
  if (!grid || !filters) return;

  grid.innerHTML = PROJECTS.map((p, i) => `
    <li class="pj-card" data-cat="${p.cat}" data-index="${i}">
      <article class="pj-card-inner">
        <span class="pj-card-visual">${visualHTML(p)}<span class="pj-card-num" aria-hidden="true">${pad(i + 1)}</span></span>
        <div class="pj-card-body">
          <p class="pj-card-meta"><span>${esc(CATEGORIES[p.cat])}</span><span>${p.year}</span></p>
          <h3 class="pj-card-title">
            <button class="pj-card-open" type="button" data-index="${i}" aria-haspopup="dialog">${esc(p.title)}</button>
          </h3>
          <p class="pj-card-teaser">${esc(p.teaser)}</p>
          <span class="pj-card-cta" aria-hidden="true">Voir la fiche <span>→</span></span>
        </div>
      </article>
    </li>`).join('');

  const items = [...grid.children];
  const buttons = [...filters.querySelectorAll('[data-filter]')];

  // Nombre de projets par filtre
  buttons.forEach((b) => {
    const f = b.dataset.filter;
    const n = f === 'all' ? N : PROJECTS.filter((p) => p.cat === f).length;
    b.querySelector('.pj-filter-n').textContent = pad(n);
  });

  const match = (li, f) => f === 'all' || li.dataset.cat === f;
  let current = 'all';

  const apply = (f) => {
    if (f === current) return;
    const prev = current;
    current = f;
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === f)));
    const count = items.filter((li) => match(li, f)).length;
    status.textContent = `${count} projet${count > 1 ? 's' : ''} affiché${count > 1 ? 's' : ''}${f === 'all' ? '' : ` en ${CATEGORIES[f]}`}.`;

    const gsap = window.gsap;
    if (!gsap || reduced) {
      items.forEach((li) => { li.hidden = !match(li, f); });
      return;
    }

    // Repart d'un état propre si une animation précédente est interrompue
    gsap.killTweensOf(items);
    items.forEach((li) => {
      li.removeAttribute('style');
      li.hidden = !match(li, prev);
    });

    // First : positions avant le changement
    const first = new Map(items.map((li) => [li, li.hidden ? null : li.getBoundingClientRect()]));
    const gridRect = grid.getBoundingClientRect();
    const leaving = items.filter((li) => !li.hidden && !match(li, f));
    const entering = items.filter((li) => li.hidden && match(li, f));
    const staying = items.filter((li) => !li.hidden && match(li, f));

    // Last : nouvelle disposition
    items.forEach((li) => { li.hidden = !match(li, f); });

    // Les cartes qui sortent restent un instant à leur ancienne place
    leaving.forEach((li) => {
      const r = first.get(li);
      li.hidden = false;
      Object.assign(li.style, {
        position: 'absolute',
        left: `${r.left - gridRect.left}px`,
        top: `${r.top - gridRect.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
        pointerEvents: 'none',
        zIndex: '0',
      });
    });

    // Invert + Play
    staying.forEach((li) => {
      const a = first.get(li);
      const b = li.getBoundingClientRect();
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      gsap.fromTo(li, { x: dx, y: dy }, { x: 0, y: 0, duration: 0.8, ease: 'power3.inOut', clearProps: 'transform' });
    });

    if (leaving.length) {
      gsap.to(leaving, {
        opacity: 0,
        scale: 0.85,
        duration: 0.35,
        ease: 'power2.in',
        onComplete: () => leaving.forEach((li) => {
          li.removeAttribute('style');
          li.hidden = !match(li, current);
        }),
      });
    }

    if (entering.length) {
      gsap.fromTo(entering, { opacity: 0, scale: 0.85, y: 40 }, {
        opacity: 1,
        scale: 1,
        y: 0,
        duration: 0.7,
        delay: 0.25,
        stagger: 0.06,
        ease: 'power3.out',
        clearProps: 'opacity,transform',
      });
    }
  };

  filters.addEventListener('click', (e) => {
    const b = e.target instanceof Element && e.target.closest('[data-filter]');
    if (b) apply(b.dataset.filter);
  });

  grid.addEventListener('click', (e) => {
    const b = e.target instanceof Element && e.target.closest('.pj-card-open');
    if (b) openProject(Number(b.dataset.index), b);
  });

  // Légère inclinaison des cartes sous la souris
  if (finePointer && !reduced) {
    items.forEach((li) => {
      const inner = li.querySelector('.pj-card-inner');
      li.addEventListener('pointermove', (e) => {
        const r = inner.getBoundingClientRect();
        inner.style.setProperty('--rx', `${((e.clientY - r.top) / r.height - 0.5) * -8}deg`);
        inner.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 10}deg`);
      });
      li.addEventListener('pointerleave', () => {
        inner.style.setProperty('--rx', '0deg');
        inner.style.setProperty('--ry', '0deg');
      });
    });
  }

  return { buttonFor: (i) => grid.querySelector(`.pj-card-open[data-index="${i}"]`) };
}

/* ------------------------------------------------------------------------ */
/* Aperçu Three.js : un seul renderer partagé par toutes les fiches          */
/* ------------------------------------------------------------------------ */
function createPreview(wrap) {
  const canvas = wrap.querySelector('canvas');
  let THREE = null;
  let loading = null;
  let failed = false;
  let renderer = null;
  let scene = null;
  let camera = null;
  let pivot = null;
  let keyLight = null;
  let rimLight = null;
  let obj = null;
  let running = false;
  let raf = 0;
  let last = 0;
  let elapsed = 0;
  let token = 0;
  let freeTimer = 0;
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };

  const hasWebGL = () => {
    try {
      const c = document.createElement('canvas');
      return Boolean(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) {
      return false;
    }
  };

  const load = () => {
    if (!loading) {
      loading = (hasWebGL() ? import('three') : Promise.reject(new Error('webgl')))
        .then((m) => { THREE = m; })
        .catch(() => { failed = true; });
    }
    return loading;
  };

  const init = () => {
    if (renderer) return true;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) {
      failed = true;
      return false;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 7);

    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(2, 4, 5);
    scene.add(sun);
    keyLight = new THREE.PointLight(0xffffff, 40, 0, 2);
    keyLight.position.set(3.5, 2, 3.5);
    rimLight = new THREE.PointLight(0xffffff, 35, 0, 2);
    rimLight.position.set(-3.5, -2, 1.5);
    scene.add(keyLight, rimLight);

    pivot = new THREE.Group();
    scene.add(pivot);

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      stopLoop();
      wrap.classList.remove('is-ready');
    });
    canvas.addEventListener('webglcontextrestored', () => {
      wrap.classList.add('is-ready');
      if (running) startLoop();
    });

    const resize = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Recule un peu la caméra en portrait pour garder l'objet entier
      camera.position.z = w / h < 0.9 ? 8.6 : 7;
      camera.updateProjectionMatrix();
      if (!raf && obj) renderer.render(scene, camera);
    };
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(wrap);
    else window.addEventListener('resize', resize);
    resize();
    return true;
  };

  const tick = (now) => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    elapsed += dt;
    const k = 1 - Math.exp(-dt * 4);
    mouse.x += (mouse.tx - mouse.x) * k;
    mouse.y += (mouse.ty - mouse.y) * k;
    pivot.rotation.y = mouse.x * 0.7;
    pivot.rotation.x = mouse.y * 0.45;
    if (obj) {
      const u = obj.userData;
      u.grow = Math.min(u.grow + dt * 1.6, 1);
      obj.scale.setScalar(1 - Math.pow(1 - u.grow, 3));
      if (!reduced) obj.rotation.y += dt * 0.35;
      u.update(reduced ? 0 : elapsed, dt);
    }
    renderer.render(scene, camera);
  };

  const startLoop = () => {
    if (raf || !renderer || document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };
  const stopLoop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };

  const disposeObj = () => {
    if (!obj) return;
    obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const m = o.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else if (m) m.dispose();
    });
    obj.removeFromParent();
    obj = null;
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopLoop();
    else if (running) startLoop();
  });

  return {
    preload: () => { load(); },
    pointer(e) {
      mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    },
    async show(p) {
      const my = ++token;
      wrap.classList.remove('is-ready');
      await load();
      if (my !== token) return; // un autre projet a été demandé entre-temps
      if (failed || !init()) {
        wrap.classList.add('is-fallback');
        return;
      }
      disposeObj();
      obj = buildObject(THREE, p);
      obj.userData.grow = reduced ? 1 : 0;
      pivot.add(obj);
      keyLight.color.set(p.colors[0]);
      rimLight.color.set(p.colors[1]);
      wrap.classList.add('is-ready');
      if (running) startLoop();
      else renderer.render(scene, camera);
    },
    start() {
      clearTimeout(freeTimer);
      running = true;
      startLoop();
    },
    // Pause immédiate, ressources du projet libérées après la fermeture
    stop() {
      running = false;
      token++;
      stopLoop();
      clearTimeout(freeTimer);
      freeTimer = setTimeout(() => {
        disposeObj();
        if (renderer) {
          renderer.renderLists.dispose();
          renderer.clear();
        }
        wrap.classList.remove('is-ready');
      }, 700);
    },
  };
}

// Objet 3D procédural propre à chaque projet (Three.js cœur uniquement)
function buildObject(THREE, p) {
  const ca = new THREE.Color(p.colors[0]);
  const cb = new THREE.Color(p.colors[1]);
  const root = new THREE.Group();
  let update = () => {};

  const solid = (geo, opts = {}) => new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: ca,
    emissive: cb,
    emissiveIntensity: 0.15,
    metalness: 0.55,
    roughness: 0.3,
    flatShading: true,
    ...opts,
  }));
  const edges = (geo, color = cb, opacity = 0.6) => new THREE.LineSegments(
    new THREE.EdgesGeometry(geo, 1),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  );
  const wire = (geo, color = cb, opacity = 0.2) => new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity }),
  );

  switch (p.shape) {
    case 'knot': {
      const knot = solid(new THREE.TorusKnotGeometry(1.05, 0.3, 220, 24, 2, 3), { flatShading: false, metalness: 0.75, roughness: 0.18 });
      const cage = wire(new THREE.TorusKnotGeometry(1.05, 0.46, 90, 8, 2, 3), cb, 0.16);
      root.add(knot, cage);
      update = (t) => { cage.rotation.z = t * 0.25; };
      break;
    }
    case 'ico': {
      const core = solid(new THREE.IcosahedronGeometry(1.05, 0));
      const shellGeo = new THREE.IcosahedronGeometry(1.55, 1);
      const shell = edges(shellGeo, cb, 0.7);
      shellGeo.dispose(); // seules les arêtes sont gardées
      const glow = wire(new THREE.IcosahedronGeometry(1.9, 2), ca, 0.08);
      root.add(core, shell, glow);
      update = (t) => {
        const s = 1 + Math.sin(t * 2.4) * 0.06 + Math.sin(t * 5.3) * 0.02;
        shell.scale.setScalar(s);
        glow.scale.setScalar(2 - s);
        core.rotation.x = t * 0.4;
      };
      break;
    }
    case 'octa': {
      const geo = new THREE.OctahedronGeometry(1.1, 0);
      root.add(solid(geo), edges(geo, cb, 0.9));
      const orbit = new THREE.Group();
      const smallGeo = new THREE.OctahedronGeometry(0.18, 0);
      for (let i = 0; i < 6; i++) {
        const s = solid(smallGeo, { color: cb, emissive: cb, emissiveIntensity: 0.4 });
        const a = (i / 6) * Math.PI * 2;
        s.position.set(Math.cos(a) * 2, Math.sin(a * 2) * 0.35, Math.sin(a) * 2);
        orbit.add(s);
      }
      orbit.rotation.z = 0.35;
      root.add(orbit);
      update = (t) => {
        orbit.rotation.y = t * 0.8;
        orbit.children.forEach((c, i) => { c.rotation.x = t * 2 + i; });
      };
      break;
    }
    case 'torus': {
      const wheel = solid(new THREE.TorusGeometry(1.15, 0.34, 40, 120), { flatShading: false, metalness: 0.85, roughness: 0.15 });
      const spokes = new THREE.Group();
      const spokeGeo = new THREE.CylinderGeometry(0.025, 0.025, 2.3, 6);
      for (let i = 0; i < 8; i++) {
        const s = solid(spokeGeo, { color: cb, metalness: 0.9, roughness: 0.2 });
        s.rotation.z = (i / 8) * Math.PI;
        spokes.add(s);
      }
      const halo = wire(new THREE.TorusGeometry(1.75, 0.015, 6, 120), cb, 0.8);
      root.add(wheel, spokes, halo);
      update = (t) => {
        spokes.rotation.z = -t * 1.2;
        halo.rotation.x = Math.sin(t * 0.7) * 0.6;
      };
      break;
    }
    case 'points': {
      // Sphère de Fibonacci bruitée, couleurs en dégradé vertical
      const count = 2600;
      const pos = new Float32Array(count * 3);
      const col = new Float32Array(count * 3);
      const tmp = new THREE.Color();
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < count; i++) {
        const y = 1 - (i / (count - 1)) * 2;
        const r = Math.sqrt(1 - y * y);
        const th = golden * i;
        const rad = 1.45 + Math.sin(i * 12.9898) * 0.08;
        pos.set([Math.cos(th) * r * rad, y * rad, Math.sin(th) * r * rad], i * 3);
        tmp.copy(ca).lerp(cb, (y + 1) / 2);
        col.set([tmp.r, tmp.g, tmp.b], i * 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({
        size: 0.05,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
      const core = solid(new THREE.IcosahedronGeometry(0.6, 2), { opacity: 0.85, transparent: true });
      root.add(pts, core);
      update = (t) => {
        pts.scale.setScalar(1 + Math.sin(t * 1.3) * 0.05);
        pts.rotation.x = Math.sin(t * 0.3) * 0.3;
        core.rotation.y = -t * 0.6;
      };
      break;
    }
    case 'prism': {
      const geo = new THREE.CylinderGeometry(1.05, 1.05, 2.4, 3, 1);
      const prism = solid(geo, { transparent: true, opacity: 0.88, metalness: 0.3, roughness: 0.1 });
      const rays = new THREE.Group();
      const rayGeo = new THREE.BoxGeometry(2.6, 0.035, 0.035);
      for (let i = 0; i < 6; i++) {
        const c = new THREE.Color().setHSL(0.72 + i * 0.07, 0.9, 0.6);
        const ray = new THREE.Mesh(rayGeo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.8 }));
        ray.position.set(1.9, (i - 2.5) * 0.14, 0);
        ray.rotation.z = (i - 2.5) * 0.09;
        rays.add(ray);
      }
      root.add(prism, edges(geo, 0xffffff, 0.7), rays);
      update = (t) => {
        rays.children.forEach((r, i) => { r.material.opacity = 0.45 + Math.sin(t * 2 + i) * 0.35; });
      };
      break;
    }
    case 'rings': {
      const planet = solid(new THREE.SphereGeometry(0.6, 32, 20), { flatShading: false, metalness: 0.4, roughness: 0.4 });
      root.add(planet);
      const rings = [];
      [1.1, 1.5, 1.9].forEach((r, i) => {
        const ring = solid(new THREE.TorusGeometry(r, 0.035, 8, 140), { color: i % 2 ? ca : cb, emissive: cb, emissiveIntensity: 0.5, flatShading: false });
        ring.rotation.set(Math.PI / 2 + i * 0.35, i * 0.6, 0);
        rings.push(ring);
        root.add(ring);
      });
      const ship = solid(new THREE.ConeGeometry(0.1, 0.28, 4), { color: 0xffffff, emissive: cb, emissiveIntensity: 0.8 });
      root.add(ship);
      update = (t) => {
        rings.forEach((r, i) => { r.rotation.z = t * (0.3 + i * 0.2) * (i % 2 ? -1 : 1); });
        const a = t * 1.1;
        ship.position.set(Math.cos(a) * 1.9, Math.sin(a * 2) * 0.25, Math.sin(a) * 1.9);
        ship.rotation.set(0, -a, Math.PI / 2);
      };
      break;
    }
    case 'monolith':
    default: {
      const blocks = [];
      const specs = [
        [1.8, 0.45, 0.9, 0, -1.1],
        [1.2, 0.45, 0.9, -0.3, -0.6],
        [1.5, 0.45, 0.9, 0.25, -0.1],
        [0.9, 0.45, 0.9, -0.15, 0.4],
        [1.3, 0.45, 0.9, 0.2, 0.9],
      ];
      specs.forEach(([w, h, d, x, y], i) => {
        const geo = new THREE.BoxGeometry(w, h, d);
        const b = solid(geo, i % 2
          ? { color: cb, emissive: cb, emissiveIntensity: 0.12, metalness: 0.2, roughness: 0.6 }
          : { metalness: 0.1, roughness: 0.75 });
        b.add(edges(geo, 0xffffff, 0.35));
        b.position.set(x, y, 0);
        b.userData.baseY = y;
        blocks.push(b);
        root.add(b);
      });
      update = (t) => {
        blocks.forEach((b, i) => {
          b.position.y = b.userData.baseY + Math.sin(t * 1.6 - i * 0.7) * 0.06;
          b.rotation.y = Math.sin(t * 0.8 + i) * 0.12;
        });
      };
      break;
    }
  }

  // Halo de particules commun à tous les projets
  const haloCount = 420;
  const hp = new Float32Array(haloCount * 3);
  for (let i = 0; i < haloCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 2.3 + Math.random() * 0.6;
    hp.set([Math.cos(a) * r, (Math.random() - 0.5) * 0.25, Math.sin(a) * r], i * 3);
  }
  const haloGeo = new THREE.BufferGeometry();
  haloGeo.setAttribute('position', new THREE.BufferAttribute(hp, 3));
  const halo = new THREE.Points(haloGeo, new THREE.PointsMaterial({
    color: cb,
    size: 0.03,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  halo.rotation.x = 0.35;
  root.add(halo);

  root.userData.update = (t, dt) => {
    halo.rotation.y = t * 0.08;
    update(t, dt);
  };
  return root;
}

/* ------------------------------------------------------------------------ */
/* Modale de détail                                                          */
/* ------------------------------------------------------------------------ */
function initModal() {
  const modal = $('#pj-modal');
  const info = $('#pj-modal-info');
  const previewWrap = $('#pj-modal-preview');
  const fallback = $('#pj-modal-fallback');
  const closeBtn = $('#pj-modal-close');
  const prevBtn = $('#pj-modal-prev');
  const nextBtn = $('#pj-modal-next');
  const outside = [$('.nav'), $('main'), $('.footer')].filter(Boolean);
  const preview = createPreview(previewWrap);
  const root = document.documentElement;

  let index = 0;
  let opener = null;
  let isOpen = false;
  let onClose = () => {};

  const fill = (i) => {
    const p = PROJECTS[i];
    index = i;
    $('#pj-modal-kicker').textContent = `${CATEGORIES[p.cat]} · ${p.year}`;
    $('#pj-modal-title').textContent = p.title;
    $('#pj-modal-desc').textContent = p.description;
    $('#pj-modal-client').textContent = `${p.client} (client fictif)`;
    $('#pj-modal-role').textContent = p.role;
    $('#pj-modal-duration').textContent = p.duration;
    $('#pj-modal-year').textContent = String(p.year);
    $('#pj-modal-index').textContent = `${pad(i + 1)} / ${pad(N)}`;
    $('#pj-modal-tech').innerHTML = p.tech.map((t) => `<li>${esc(t)}</li>`).join('');
    $('#pj-modal-results').innerHTML = p.results
      .map((r) => `<li><strong>${esc(r.value)}</strong><span>${esc(r.label)}</span></li>`).join('');
    $('#pj-modal-prev-name').textContent = PROJECTS[mod(i - 1, N)].title;
    $('#pj-modal-next-name').textContent = PROJECTS[mod(i + 1, N)].title;
    modal.style.setProperty('--m1', p.colors[0]);
    modal.style.setProperty('--m2', p.colors[1]);
    fallback.innerHTML = visualHTML(p, 'pv--large');
    info.scrollTop = 0;
    modal.scrollTop = 0;
    preview.show(p);
    if (history.replaceState) history.replaceState(null, '', `#${p.slug}`);
  };

  const animateIn = () => {
    const gsap = window.gsap;
    if (!gsap || reduced) return;
    gsap.fromTo(info.children, { opacity: 0, y: 24 }, {
      opacity: 1, y: 0, duration: 0.6, stagger: 0.04, ease: 'power3.out', clearProps: 'opacity,transform', overwrite: true,
    });
  };

  const open = (i, from) => {
    opener = from || document.activeElement;
    fill(i);
    if (!isOpen) {
      isOpen = true;
      modal.classList.add('is-open');
      root.classList.add('pj-modal-open');
      outside.forEach((el) => { el.inert = true; });
      preview.start();
    }
    closeBtn.focus({ preventScroll: true });
    animateIn();
  };

  const close = () => {
    if (!isOpen) return;
    isOpen = false;
    modal.classList.remove('is-open');
    root.classList.remove('pj-modal-open');
    outside.forEach((el) => { el.inert = false; });
    preview.stop();
    if (history.replaceState) history.replaceState(null, '', location.pathname + location.search);
    onClose(index);
    if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
  };

  const step = (dir) => {
    fill(mod(index + dir, N));
    animateIn();
  };

  closeBtn.addEventListener('click', close);
  prevBtn.addEventListener('click', () => step(-1));
  nextBtn.addEventListener('click', () => step(1));

  // Clic sur le fond (hors panneau) : fermeture
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  modal.addEventListener('pointermove', (e) => preview.pointer(e));

  // Échap, flèches et piège du focus
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      step(e.key === 'ArrowLeft' ? -1 : 1);
      return;
    }
    if (e.key !== 'Tab') return;
    const focusables = [...modal.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((el) => el.offsetParent !== null || el === closeBtn);
    if (!focusables.length) return;
    const firstEl = focusables[0];
    const lastEl = focusables[focusables.length - 1];
    if (e.shiftKey && (document.activeElement === firstEl || !modal.contains(document.activeElement))) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && document.activeElement === lastEl) {
      e.preventDefault();
      firstEl.focus();
    }
  });

  // Filet de sécurité si le focus s'échappe malgré tout
  document.addEventListener('focusin', (e) => {
    if (isOpen && !modal.contains(e.target)) closeBtn.focus({ preventScroll: true });
  });

  return {
    open,
    preload: preview.preload,
    setOnClose: (fn) => { onClose = fn; },
  };
}

/* ------------------------------------------------------------------------ */
/* Démarrage                                                                 */
/* ------------------------------------------------------------------------ */
function start() {
  initCommon();
  initHero();

  const modal = initModal();
  const ringApi = initRing(modal.open);
  const gridApi = initGrid(modal.open);

  // L'anneau se recentre sur le dernier projet consulté
  if (ringApi) modal.setOnClose((i) => ringApi.show(i));

  document.querySelectorAll('.pj-modal-cta, .pj-cta [data-magnetic]').forEach((el) => bindMagnetic(el));

  initCounters();
  initReveal();
  initScrollFx();

  // Three.js chargé en tâche de fond, après l'affichage
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
  idle(() => modal.preload());

  // Lien direct vers une fiche : projets.html#nebuleuse
  const slug = decodeURIComponent(location.hash.slice(1));
  const i = PROJECTS.findIndex((p) => p.slug === slug);
  if (i >= 0) setTimeout(() => modal.open(i, gridApi ? gridApi.buttonFor(i) : null), reduced ? 0 : 700);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
