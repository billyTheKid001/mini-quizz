// Pages secondaires : 404 ("404" en particules, astronaute, mini-jeu) et
// mentions légales (sommaire actif, progression de lecture, outil de stockage).
// La page est détectée via <body data-page="...">. Three.js n'est chargé que
// sur la 404, par import dynamique.
import { initCommon } from './common.js';

const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const isReduced = () => reducedQuery.matches;

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
// Lissage indépendant du framerate
const damp = (k, dt) => 1 - Math.exp(-k * dt);

// localStorage peut être bloqué : tout passe par ici
const store = {
  get(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  },
  set(key, value) {
    try { window.localStorage.setItem(key, value); return true; } catch (e) { return false; }
  },
  remove(key) {
    try { window.localStorage.removeItem(key); return true; } catch (e) { return false; }
  },
};

const KEYS = {
  best: 'orbitale-404-best',
  calm: 'orbitale-404-calm',
};

/* ------------------------------------------------------------------------ */
/* Apparitions au scroll (si GSAP est là)                                    */
/* ------------------------------------------------------------------------ */
function initReveals() {
  const gsap = window.gsap;
  const ST = window.ScrollTrigger;
  if (!gsap || !ST || isReduced()) return;
  gsap.registerPlugin(ST);
  document.querySelectorAll('[data-reveal]').forEach((el) => {
    gsap.from(el, {
      autoAlpha: 0,
      y: 48,
      duration: 1,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
  });
}

/* ======================================================================== */
/* 404                                                                       */
/* ======================================================================== */

const TEXT_VERTEX = /* glsl */ `
attribute vec3 aScatter;
attribute float aSeed;

uniform float uTime;
uniform float uIntro;
uniform float uBurst;
uniform float uPixelRatio;
uniform float uSize;
uniform float uRadius;
uniform float uHalfWidth;
uniform vec3 uMouse; // xy dans le repère du texte + intensité
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;

varying vec3 vColor;
varying float vAlpha;

void main() {
  // Position cible : la lettre, avec un léger flottement
  vec3 target = position;
  target.x += sin(uTime * 0.8 + aSeed * 12.0) * 0.03;
  target.y += cos(uTime * 0.9 + aSeed * 9.0) * 0.03;
  target.z += sin(uTime * 0.6 + aSeed * 20.0) * 0.12;

  // Intro : les particules convergent depuis le vide, en décalé
  float e = clamp(uIntro * 1.4 - aSeed * 0.4, 0.0, 1.0);
  e = e * e * (3.0 - 2.0 * e);
  vec3 pos = mix(aScatter, target, e);

  // Dispersion autour du pointeur
  vec2 d = pos.xy - uMouse.xy;
  float dist = length(d);
  float f = (1.0 - smoothstep(0.0, uRadius, dist)) * uMouse.z;
  vec2 dir = dist > 0.0001 ? d / dist : vec2(0.0, 1.0);
  pos.xy += dir * f * (1.2 + aSeed * 1.2);
  pos.z += f * (aSeed - 0.3) * 3.0;

  // Explosion au clic
  pos += (aScatter - target) * 0.35 * uBurst * (0.5 + aSeed);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uPixelRatio * (1.0 + f * 0.8) * (10.0 / max(-mv.z, 0.5));

  // Dégradé violet -> cyan -> rose de gauche à droite
  float k = clamp(position.x / uHalfWidth * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = k < 0.5 ? mix(uColorA, uColorB, k * 2.0) : mix(uColorB, uColorC, k * 2.0 - 1.0);
  vColor = mix(col, vec3(1.0), f * 0.5);
  vAlpha = 0.35 + e * 0.65;
}
`;

const TEXT_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = 1.0 - smoothstep(0.15, 0.5, d);
  gl_FragColor = vec4(vColor, a * vAlpha);
}
`;

// Échantillonne un texte dessiné sur un canvas 2D -> nuage de points
async function sampleText(text, step) {
  const family = 'Syne, "Arial Black", sans-serif';
  if (document.fonts && document.fonts.load) {
    try {
      await Promise.race([document.fonts.load(`800 300px ${family}`), new Promise((r) => setTimeout(r, 1500))]);
    } catch (err) {
      // police indisponible : repli sur Arial Black
    }
  }
  const W = 1100;
  const H = 400;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  let size = 300;
  ctx.font = `800 ${size}px ${family}`;
  const measured = ctx.measureText(text).width;
  if (measured > W * 0.94) {
    size = Math.floor((size * W * 0.94) / measured);
    ctx.font = `800 ${size}px ${family}`;
  }
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, H / 2);

  const data = ctx.getImageData(0, 0, W, H).data;
  const pts = [];
  let minX = W;
  let maxX = 0;
  let minY = H;
  let maxY = 0;
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      if (data[(y * W + x) * 4 + 3] > 128) {
        const px = x + (Math.random() - 0.5) * step * 0.7;
        const py = y + (Math.random() - 0.5) * step * 0.7;
        pts.push(px, py);
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    }
  }
  if (!pts.length) return null;
  return { pts, minX, maxX, minY, maxY };
}

// Astronaute stylisé fait de primitives
function buildAstronaut(THREE) {
  const group = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: 0xebe8ff, roughness: 0.55, metalness: 0.05 });
  const gear = new THREE.MeshStandardMaterial({ color: 0xbdb5f2, roughness: 0.6, metalness: 0.1 });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x0b0b16, roughness: 0.12, metalness: 0.9, emissive: 0x2a1b6b, emissiveIntensity: 0.6,
  });
  const glow = new THREE.MeshStandardMaterial({ color: 0xff3d81, emissive: 0xff3d81, emissiveIntensity: 1.6 });
  const glowCyan = new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 1.2 });
  const geos = [];
  const add = (geo, mat, x, y, z, rz = 0, parent = group) => {
    geos.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.z = rz;
    parent.add(m);
    return m;
  };

  add(new THREE.CapsuleGeometry(0.42, 0.5, 8, 20), suit, 0, 0, 0);
  add(new THREE.SphereGeometry(0.44, 32, 24), suit, 0, 0.82, 0);
  const visor = add(new THREE.SphereGeometry(0.32, 32, 20), visorMat, 0, 0.84, 0.2);
  visor.scale.set(1.12, 0.78, 0.62);
  add(new THREE.BoxGeometry(0.66, 0.74, 0.3), gear, 0, 0.12, -0.4);
  add(new THREE.BoxGeometry(0.3, 0.16, 0.06), gear, 0, 0.18, 0.41);
  add(new THREE.SphereGeometry(0.035, 12, 8), glow, -0.07, 0.18, 0.45);
  add(new THREE.SphereGeometry(0.035, 12, 8), glowCyan, 0.07, 0.18, 0.45);
  // Antenne
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 8), gear, 0.24, 1.24, -0.12, -0.25);
  const tip = add(new THREE.SphereGeometry(0.05, 12, 8), glow, 0.285, 1.41, -0.12);
  // Bras : un pivot à l'épaule pour pouvoir faire coucou
  const makeArm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.44 * side, 0.32, 0);
    group.add(pivot);
    add(new THREE.CapsuleGeometry(0.12, 0.4, 6, 12), suit, 0, -0.3, 0, 0, pivot);
    add(new THREE.SphereGeometry(0.14, 16, 12), gear, 0, -0.6, 0, 0, pivot);
    return pivot;
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);
  armR.rotation.z = 0.5;
  // Jambes
  add(new THREE.CapsuleGeometry(0.15, 0.36, 6, 12), suit, -0.19, -0.66, 0, 0.12);
  add(new THREE.CapsuleGeometry(0.15, 0.36, 6, 12), suit, 0.19, -0.66, 0, -0.18);

  const dispose = () => {
    geos.forEach((g) => g.dispose());
    [suit, gear, visorMat, glow, glowCyan].forEach((m) => m.dispose());
  };
  return { group, armL, armR, tip, dispose };
}

async function initLost() {
  const section = document.getElementById('pg-lost');
  const canvas = document.getElementById('lost-canvas');
  const content = section && section.querySelector('.pg-lost-content');
  if (!section || !canvas || !content) return;

  const fallback = () => {
    section.classList.add('is-fallback');
    canvas.remove();
  };

  let THREE;
  try {
    THREE = await import('three');
  } catch (err) {
    fallback();
    return;
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (err) {
    fallback();
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const small = window.innerWidth < 700;
  const sample = await sampleText('404', small ? 4 : 3);
  if (!sample) {
    renderer.dispose();
    fallback();
    return;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 12);

  /* --- "404" en particules --- */
  const TEXT_W = 10;
  const scale = TEXT_W / (sample.maxX - sample.minX);
  const cx = (sample.minX + sample.maxX) / 2;
  const cy = (sample.minY + sample.maxY) / 2;
  const TEXT_H = (sample.maxY - sample.minY) * scale;
  const count = sample.pts.length / 2;

  const positions = new Float32Array(count * 3);
  const scatter = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (sample.pts[i * 2] - cx) * scale;
    positions[i * 3 + 1] = -(sample.pts[i * 2 + 1] - cy) * scale;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
    // Point de départ aléatoire sur une coquille autour du texte
    const r = 8 + Math.random() * 8;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    scatter[i * 3] = r * Math.sin(ph) * Math.cos(th);
    scatter[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.7;
    scatter[i * 3 + 2] = r * Math.cos(ph) * 0.6;
    seeds[i] = Math.random();
  }
  const textGeo = new THREE.BufferGeometry();
  textGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  textGeo.setAttribute('aScatter', new THREE.BufferAttribute(scatter, 3));
  textGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

  const vec3 = (hex) => new THREE.Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
  const uniforms = {
    uTime: { value: 0 },
    uIntro: { value: isReduced() ? 1 : 0 },
    uBurst: { value: 0 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uSize: { value: small ? 3.2 : 2.6 },
    uRadius: { value: 1.6 },
    uHalfWidth: { value: TEXT_W / 2 },
    uMouse: { value: new THREE.Vector3(0, 0, 0) },
    uColorA: { value: vec3(0x7c5cff) },
    uColorB: { value: vec3(0x00e5ff) },
    uColorC: { value: vec3(0xff3d81) },
  };
  const textMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: TEXT_VERTEX,
    fragmentShader: TEXT_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const text = new THREE.Points(textGeo, textMat);
  text.frustumCulled = false;
  scene.add(text);

  /* --- Champ d'étoiles --- */
  const STARS = small ? 400 : 800;
  const starPos = new Float32Array(STARS * 3);
  for (let i = 0; i < STARS; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * 60;
    starPos[i * 3 + 1] = (Math.random() - 0.5) * 36;
    starPos[i * 3 + 2] = -4 - Math.random() * 26;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, transparent: true, opacity: 0.7, depthWrite: false });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  /* --- Astronaute + lumières --- */
  const astro = buildAstronaut(THREE);
  scene.add(astro.group);
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(3, 4, 6);
  scene.add(key);
  const rimViolet = new THREE.PointLight(0x7c5cff, 40, 30);
  rimViolet.position.set(-4, -2, 3);
  scene.add(rimViolet);
  const rimCyan = new THREE.PointLight(0x00e5ff, 25, 30);
  rimCyan.position.set(5, 3, 2);
  scene.add(rimCyan);
  const astroBase = new THREE.Vector3();

  /* --- Mise en page : le 404 occupe l'espace au-dessus du texte HTML --- */
  function layout() {
    const w = section.clientWidth;
    const h = section.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    const visH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const visW = visH * camera.aspect;
    const perPx = visH / h;
    const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 72;
    const portrait = w / h < 0.9;

    const availPx = Math.max(content.offsetTop - navH - 16, h * 0.22);
    const centerPx = navH + 8 + availPx / 2;
    const s = Math.min(visW * (portrait ? 0.86 : 0.62) / TEXT_W, (availPx * perPx * 0.86) / TEXT_H, 1.2);
    text.scale.setScalar(s);
    text.position.set(0, (h / 2 - centerPx) * perPx, 0);

    // Marge sous la nav (le casque ne doit pas passer sous le burger)
    const topLimit = visH / 2 - navH * perPx - 1.1;
    if (portrait) {
      astro.group.scale.setScalar(0.42);
      astroBase.set(visW * 0.3, Math.min(text.position.y + (TEXT_H * s) / 2 + 0.35, topLimit), 1);
    } else {
      astro.group.scale.setScalar(0.85);
      astroBase.set(Math.min((TEXT_W * s) / 2 + 1.6, visW / 2 - 1.6), Math.min(text.position.y + (TEXT_H * s) * 0.3, topLimit), 1);
    }
  }

  /* --- Pointeur --- */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();
  const mouseLocal = new THREE.Vector2(0, 0);
  let mouseStrength = 0;
  let mouseInside = false;
  let lookX = 0;

  const updatePointer = (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.ray.intersectPlane(plane, hit)) {
      text.worldToLocal(hit);
      mouseLocal.set(hit.x, hit.y);
    }
    mouseInside = true;
  };
  section.addEventListener('pointermove', updatePointer, { passive: true });
  section.addEventListener('pointerdown', updatePointer, { passive: true });
  section.addEventListener('pointerleave', () => { mouseInside = false; });
  section.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') mouseInside = false; });

  // Clic dans le vide : explosion du 404
  let kick = 0;
  section.addEventListener('click', (e) => {
    if (isReduced()) return;
    if (e.target instanceof Element && e.target.closest('a, button')) return;
    kick = 1;
  });

  /* --- Boucle --- */
  let time = 0;
  let intro = uniforms.uIntro.value;
  function tick(dt) {
    const speed = isReduced() ? 0.15 : 1;
    time += dt * speed;
    uniforms.uTime.value = time;

    if (intro < 1) {
      intro = Math.min(1, intro + dt / 2.4);
      uniforms.uIntro.value = intro;
    }

    // Pointeur lissé
    mouseStrength += ((mouseInside ? 1 : 0) - mouseStrength) * damp(5, dt);
    const m = uniforms.uMouse.value;
    m.x += (mouseLocal.x - m.x) * damp(10, dt);
    m.y += (mouseLocal.y - m.y) * damp(10, dt);
    m.z = mouseStrength;

    // Explosion : montée rapide, retombée douce
    uniforms.uBurst.value += (kick - uniforms.uBurst.value) * damp(10, dt);
    kick *= Math.exp(-3 * dt);

    stars.rotation.z = time * 0.01;

    // Astronaute en apesanteur
    const g = astro.group;
    g.position.set(
      astroBase.x + Math.sin(time * 0.4) * 0.3,
      astroBase.y + Math.sin(time * 0.6) * 0.25,
      astroBase.z
    );
    lookX += ((mouseInside ? ndc.x : 0) * 0.5 - lookX) * damp(3, dt);
    g.rotation.set(Math.sin(time * 0.35) * 0.2, -0.5 + Math.sin(time * 0.25) * 0.4 + lookX, Math.sin(time * 0.3) * 0.35);
    astro.armL.rotation.z = -2.5 + Math.sin(time * 4) * 0.35; // coucou
    astro.armR.rotation.z = 0.5 + Math.sin(time * 0.8) * 0.15;
    astro.tip.visible = Math.sin(time * 5) > -0.2;

    renderer.render(scene, camera);
  }

  let raf = 0;
  let running = false;
  let last = 0;
  let inView = true;
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    tick(dt);
  };
  const update = () => {
    const should = inView && !document.hidden;
    if (should && !running) {
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!should && running) {
      running = false;
      cancelAnimationFrame(raf);
    }
  };

  layout();
  window.addEventListener('resize', layout);
  if ('ResizeObserver' in window) new ResizeObserver(layout).observe(section);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      inView = entries[0].isIntersecting;
      update();
    }).observe(section);
  }
  document.addEventListener('visibilitychange', update);
  update();

  window.addEventListener('pagehide', (e) => {
    if (e.persisted) return;
    running = false;
    cancelAnimationFrame(raf);
    textGeo.dispose();
    textMat.dispose();
    starGeo.dispose();
    starMat.dispose();
    astro.dispose();
    renderer.dispose();
  });
}

// Entrée du texte du hero 404
function initLostIntro() {
  const gsap = window.gsap;
  if (!gsap || isReduced()) return;
  gsap.from('.pg-lost-content > *', {
    opacity: 0, y: 28, duration: 1, stagger: 0.09, ease: 'power3.out', delay: 0.5, clearProps: 'opacity,transform',
  });
}

/* ------------------------------------------------------------------------ */
/* Mini-jeu : pluie d'étoiles                                                */
/* ------------------------------------------------------------------------ */
const STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 1.5l2.9 6.6 7.1.7-5.4 4.8 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 8.8l7.1-.7z"/></svg>';

function initGame() {
  const sky = document.getElementById('pg-sky');
  if (!sky) return;
  const overlay = document.getElementById('pg-sky-overlay');
  const msg = document.getElementById('pg-sky-msg');
  const startBtn = document.getElementById('pg-start');
  const startLabel = startBtn.querySelector('span');
  const scoreEl = document.getElementById('pg-score');
  const timeEl = document.getElementById('pg-time');
  const bestEl = document.getElementById('pg-best');
  const calm = document.getElementById('pg-calm');
  const live = document.getElementById('pg-game-live');

  const DURATION = 20;
  let best = Number(store.get(KEYS.best)) || 0;
  let score = 0;
  let remaining = DURATION;
  let playing = false;
  let paused = false;
  let spawnTimer = 0;
  let clockTimer = 0;
  const stars = new Set();

  sky.setAttribute('tabindex', '-1');
  bestEl.textContent = String(best);
  const savedCalm = store.get(KEYS.calm);
  calm.checked = savedCalm === null ? isReduced() : savedCalm === '1';
  calm.addEventListener('change', () => store.set(KEYS.calm, calm.checked ? '1' : '0'));

  const hud = () => {
    scoreEl.textContent = String(score);
    timeEl.textContent = String(remaining);
    timeEl.classList.toggle('is-low', playing && remaining <= 5);
  };

  function removeStar(star) {
    if (!stars.has(star)) return;
    stars.delete(star);
    window.clearTimeout(star._timer);
    // Ne pas perdre le focus clavier quand l'étoile disparaît
    const hadFocus = document.activeElement === star;
    star.remove();
    if (hadFocus) {
      const next = stars.values().next().value;
      (next || sky).focus({ preventScroll: true });
    }
  }

  function pop(x, y, points, gold) {
    const el = document.createElement('div');
    el.className = `pg-pop${gold ? ' is-gold' : ''}`;
    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
    const label = document.createElement('span');
    label.textContent = `+${points}`;
    el.appendChild(label);
    sky.appendChild(el);
    window.setTimeout(() => el.remove(), 850);
  }

  function spawn() {
    if (!playing || paused) return;
    const gold = Math.random() < 0.15;
    const x = 8 + Math.random() * 84;
    const y = 12 + Math.random() * 76;
    const life = (calm.checked ? 4200 : 1900) * (gold ? 0.8 : 1);
    const star = document.createElement('button');
    star.type = 'button';
    star.className = `pg-star${gold ? ' is-gold' : ''}`;
    star.setAttribute('aria-label', gold ? 'Étoile rose, 3 points' : 'Étoile, 1 point');
    star.style.left = `${x}%`;
    star.style.top = `${y}%`;
    star.style.setProperty('--life', `${life}ms`);
    star.style.setProperty('--dx', `${Math.round((Math.random() - 0.5) * 80)}px`);
    star.style.setProperty('--dy', `${Math.round(-20 - Math.random() * 50)}px`);
    star.innerHTML = STAR_SVG;
    star.addEventListener('click', () => {
      if (!playing) return;
      const points = gold ? 3 : 1;
      score += points;
      hud();
      pop(x, y, points, gold);
      removeStar(star);
    });
    star._timer = window.setTimeout(() => removeStar(star), life);
    stars.add(star);
    sky.appendChild(star);

    // Le rythme s'accélère au fil de la partie
    const progress = 1 - remaining / DURATION;
    const base = calm.checked ? 1100 : 700;
    spawnTimer = window.setTimeout(spawn, base * (1 - progress * 0.35));
  }

  function tickClock() {
    if (!playing || paused) return;
    remaining -= 1;
    hud();
    if (remaining <= 0) end();
  }

  function begin() {
    score = 0;
    remaining = DURATION;
    playing = true;
    paused = false;
    overlay.hidden = true;
    hud();
    live.textContent = 'Partie lancée : 20 secondes.';
    sky.focus({ preventScroll: true });
    clockTimer = window.setInterval(tickClock, 1000);
    spawn();
  }

  function end() {
    playing = false;
    window.clearInterval(clockTimer);
    window.clearTimeout(spawnTimer);
    Array.from(stars).forEach((s) => removeStar(s));
    const record = score > best;
    if (record) {
      best = score;
      store.set(KEYS.best, String(best));
    }
    hud();
    bestEl.textContent = String(best);
    msg.textContent = `${score} point${score > 1 ? 's' : ''}`;
    const small = document.createElement('small');
    small.textContent = record ? 'Nouveau record personnel, bravo !' : `Record à battre : ${best}`;
    msg.appendChild(small);
    startLabel.textContent = 'Rejouer';
    overlay.hidden = false;
    live.textContent = `Partie terminée : ${score} point${score > 1 ? 's' : ''}.${record ? ' Nouveau record.' : ''}`;
    startBtn.focus({ preventScroll: true });
  }

  // Onglet caché : la partie se met en pause
  document.addEventListener('visibilitychange', () => {
    if (!playing) return;
    if (document.hidden) {
      paused = true;
      window.clearTimeout(spawnTimer);
    } else if (paused) {
      paused = false;
      spawn();
    }
  });

  startBtn.addEventListener('click', begin);
  hud();
}

/* ======================================================================== */
/* Mentions légales                                                          */
/* ======================================================================== */
function initToc() {
  const list = document.getElementById('pg-toc-list');
  if (!list) return;
  const links = Array.from(list.querySelectorAll('a[href^="#"]'));
  const sections = links.map((a) => document.getElementById(a.hash.slice(1))).filter(Boolean);
  const bar = document.getElementById('pg-progress');
  let current = undefined;
  let ticking = false;

  // Centre la pastille active dans la barre horizontale (mobile)
  const revealChip = (link) => {
    if (list.scrollWidth <= list.clientWidth + 1) return;
    const lr = list.getBoundingClientRect();
    const ar = link.getBoundingClientRect();
    const left = list.scrollLeft + (ar.left - lr.left) - (lr.width - ar.width) / 2;
    list.scrollTo({ left, behavior: isReduced() ? 'auto' : 'smooth' });
  };

  const update = () => {
    ticking = false;
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (bar) bar.style.transform = `scaleX(${max > 0 ? clamp(y / max, 0, 1) : 0})`;

    const line = window.innerHeight * 0.3;
    let active = null;
    sections.forEach((s) => {
      if (s.getBoundingClientRect().top <= line) active = s;
    });
    if (max > 0 && y >= max - 4) active = sections[sections.length - 1];

    if (active === current) return;
    current = active;
    links.forEach((a) => {
      const on = active && a.hash === `#${active.id}`;
      if (on) {
        a.setAttribute('aria-current', 'true');
        revealChip(a);
      } else {
        a.removeAttribute('aria-current');
      }
    });
  };

  const request = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request);
  update();

  // Après un saut d'ancre, le titre reçoit le focus (lecteurs d'écran)
  links.forEach((a) => {
    a.addEventListener('click', () => {
      const target = document.getElementById(a.hash.slice(1));
      const heading = target && target.querySelector('h2');
      if (!heading) return;
      heading.setAttribute('tabindex', '-1');
      window.setTimeout(() => heading.focus({ preventScroll: true }), isReduced() ? 0 : 450);
    });
  });
}

const STORAGE_LABELS = {
  'orbitale-contact-draft': 'Brouillon du formulaire de contact',
  [KEYS.best]: 'Record du mini-jeu de la page 404',
  [KEYS.calm]: 'Préférence « mode calme » du mini-jeu',
};

function initStorageTool() {
  const listEl = document.getElementById('pg-storage-list');
  if (!listEl) return;
  const refreshBtn = document.getElementById('pg-storage-refresh');
  const clearBtn = document.getElementById('pg-storage-clear');
  const live = document.getElementById('pg-storage-live');

  // Renvoie null si le stockage est inaccessible
  const read = () => {
    const out = [];
    try {
      const ls = window.localStorage;
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k && /orbitale/i.test(k)) {
          const v = ls.getItem(k) || '';
          out.push({ key: k, bytes: (k.length + v.length) * 2 });
        }
      }
    } catch (err) {
      return null;
    }
    return out.sort((a, b) => a.key.localeCompare(b.key));
  };

  const formatSize = (b) => (b < 1024 ? `${b} octets` : `${(b / 1024).toFixed(1).replace('.', ',')} Ko`);

  const emptyItem = (text) => {
    const li = document.createElement('li');
    li.className = 'pg-storage-empty';
    li.textContent = text;
    return li;
  };

  const render = () => {
    const entries = read();
    listEl.replaceChildren();
    if (entries === null) {
      listEl.appendChild(emptyItem('Le stockage local est inaccessible dans ce navigateur (navigation privée ou réglages) : rien n\'y est enregistré.'));
      clearBtn.disabled = true;
      return entries;
    }
    if (!entries.length) {
      listEl.appendChild(emptyItem('Aucune donnée ORBITALE n\'est enregistrée sur cet appareil.'));
      clearBtn.disabled = true;
      return entries;
    }
    entries.forEach(({ key, bytes }) => {
      const li = document.createElement('li');
      const code = document.createElement('code');
      code.textContent = key;
      const info = document.createElement('span');
      info.className = 'pg-storage-size';
      info.textContent = `${STORAGE_LABELS[key] || 'Donnée du site'} · ${formatSize(bytes)}`;
      li.append(code, info);
      listEl.appendChild(li);
    });
    clearBtn.disabled = false;
    return entries;
  };

  // Effacement en deux temps pour éviter les accidents
  let confirmTimer = 0;
  const resetClear = () => {
    clearBtn.dataset.confirm = '';
    clearBtn.textContent = 'Effacer ces données';
  };
  clearBtn.addEventListener('click', () => {
    if (clearBtn.dataset.confirm !== 'true') {
      clearBtn.dataset.confirm = 'true';
      clearBtn.textContent = 'Confirmer l\'effacement';
      confirmTimer = window.setTimeout(resetClear, 3500);
      return;
    }
    window.clearTimeout(confirmTimer);
    resetClear();
    const entries = read() || [];
    let removed = 0;
    entries.forEach(({ key }) => { if (store.remove(key)) removed += 1; });
    render();
    live.textContent = removed
      ? `${removed} entrée${removed > 1 ? 's' : ''} effacée${removed > 1 ? 's' : ''} de cet appareil.`
      : 'Rien à effacer.';
  });

  refreshBtn.addEventListener('click', () => {
    const entries = render();
    live.textContent = entries === null
      ? 'Stockage local inaccessible.'
      : `${entries.length} entrée${entries.length > 1 ? 's' : ''} trouvée${entries.length > 1 ? 's' : ''}.`;
  });

  // Mise à jour si un autre onglet modifie le stockage
  window.addEventListener('storage', render);
  render();
}

function initMentionsIntro() {
  const gsap = window.gsap;
  if (!gsap || isReduced()) return;
  gsap.from('.pg-legal-hero > *', { opacity: 0, y: 32, duration: 1, stagger: 0.08, ease: 'power3.out', delay: 0.4, clearProps: 'opacity,transform' });
  gsap.from('.pg-toc, .pg-legal-body', { opacity: 0, y: 40, duration: 1, stagger: 0.12, ease: 'power3.out', delay: 0.7, clearProps: 'opacity,transform' });
}

/* ------------------------------------------------------------------------ */
/* Démarrage                                                                 */
/* ------------------------------------------------------------------------ */
function start() {
  initCommon();
  const page = document.body.dataset.page;
  if (page === '404') {
    initLostIntro();
    initGame();
    initReveals();
    initLost().catch(() => {
      const section = document.getElementById('pg-lost');
      if (section) section.classList.add('is-fallback');
    });
  } else if (page === 'mentions') {
    initMentionsIntro();
    initToc();
    initStorageTool();
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
