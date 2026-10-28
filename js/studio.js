// Page Studio : globe 3D en points, frise au scroll, cartes de l'équipe,
// compteurs, marquee des outils. Tout fonctionne sans GSAP (scroll natif).
import * as THREE from 'three';
import { initCommon } from './common.js';

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */

const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
// Lissage indépendant du framerate
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const hexToRGB = (hex) => new THREE.Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);

const COLORS = { violet: 0x7c5cff, cyan: 0x00e5ff, rose: 0xff3d81 };

// Générateur pseudo-aléatoire déterministe (même globe à chaque visite)
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// 18432 -> "18 432", 3.2 -> "3,2" (espaces insécables)
function formatFr(n, decimals = 0) {
  const [int, dec] = n.toFixed(decimals).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return dec ? `${grouped},${dec}` : grouped;
}

/* ------------------------------------------------------------------ */
/* Données du globe                                                    */
/* ------------------------------------------------------------------ */

const CITIES = [
  { name: 'Paris', lat: 48.86, lon: 2.35, hq: true },
  { name: 'Montréal', lat: 45.5, lon: -73.57 },
  { name: 'São Paulo', lat: -23.55, lon: -46.63 },
  { name: 'Lagos', lat: 6.52, lon: 3.38 },
  { name: 'Tokyo', lat: 35.68, lon: 139.69 },
  { name: 'Melbourne', lat: -37.81, lon: 144.96 },
];

// Liaisons entre bureaux (indices dans CITIES)
const LINKS = [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [3, 2], [4, 5], [1, 4]];

// Continents approximés par des ellipses [lat, lon, demi-hauteur, demi-largeur] en degrés
const CONTINENTS = [
  // Amérique du Nord
  [62, -112, 10, 30], [52, -100, 8, 22], [40, -98, 9, 20], [38, -80, 7, 8], [33, -112, 6, 9],
  [64, -152, 6, 14], [72, -95, 5, 18], [58, -70, 6, 10], [46, -72, 4, 9], [48, -123, 5, 5],
  [24, -102, 7, 8], [17, -93, 4, 6], [11, -85, 4, 4], [21, -78, 1.5, 5], [73, -41, 10, 14], [65, -18, 2.5, 6],
  // Amérique du Sud
  [5, -66, 7, 12], [-5, -60, 9, 16], [-10, -42, 7, 8], [-20, -52, 9, 10], [-30, -60, 8, 8],
  [-40, -67, 8, 5], [-50, -71, 5, 4], [-12, -76, 6, 4],
  // Europe
  [47, 8, 6, 12], [40, -4, 4.5, 6], [43, 12, 3, 4], [53, -2, 4, 3], [53, -8, 2, 2], [62, 14, 7, 7],
  [64, 27, 5, 6], [52, 25, 6, 12], [45, 25, 4, 8], [56, 45, 9, 18], [39, 35, 4, 9],
  // Asie
  [63, 95, 11, 38], [68, 140, 7, 25], [62, 165, 7, 12], [47, 75, 8, 22], [45, 105, 7, 18],
  [33, 105, 9, 14], [28, 85, 5, 12], [22, 79, 9, 8], [12, 78, 5, 4], [25, 46, 9, 10], [32, 53, 6, 10],
  [16, 102, 8, 6], [5, 102, 4, 3], [37, 138, 4, 4], [43, 142, 2.5, 2.5], [37, 127, 3, 2],
  [0, 102, 4, 4], [1, 114, 4, 5], [-7, 110, 1.5, 7], [12, 122, 5, 3], [-4, 138, 3, 8],
  // Afrique
  [27, 5, 8, 20], [18, 25, 7, 15], [12, 0, 7, 15], [8, -8, 4, 6], [2, 22, 8, 12], [8, 38, 6, 7],
  [10, 47, 3, 5], [-8, 30, 8, 10], [-18, 24, 8, 10], [-28, 25, 5, 8], [-19, 47, 6, 2.5],
  // Océanie
  [-25, 134, 10, 17], [-17, 140, 4, 8], [-34, 145, 5, 8], [-32, 118, 4, 6], [-42, 147, 2, 2], [-43, 172, 5, 3],
];

function continentValue(lat, lon) {
  let best = -Infinity;
  for (let i = 0; i < CONTINENTS.length; i++) {
    const [cLat, cLon, rLat, rLon] = CONTINENTS[i];
    const dLat = (lat - cLat) / rLat;
    const dLon = ((((lon - cLon) % 360) + 540) % 360 - 180) / rLon;
    const v = 1 - Math.sqrt(dLat * dLat + dLon * dLon);
    if (v > best) best = v;
  }
  return best;
}

// Bruit de valeur 3D (côtes irrégulières)
function hash3(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

function valueNoise(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const mix = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  return mix(
    mix(mix(c(0, 0, 0), c(1, 0, 0), u), mix(c(0, 1, 0), c(1, 1, 0), u), v),
    mix(mix(c(0, 0, 1), c(1, 0, 1), u), mix(c(0, 1, 1), c(1, 1, 1), u), v),
    w
  );
}

function isLand(x, y, z, lat, lon) {
  const n = valueNoise(x * 3 + 10, y * 3, z * 3) * 0.65 + valueNoise(x * 7, y * 7 + 5, z * 7) * 0.35;
  if (lat < -70) return n > 0.25; // Antarctique
  return continentValue(lat, lon) + (n - 0.5) * 0.45 > 0;
}

// Convention : lon 0 vers +x, nord vers +y
function latLonToVec(lat, lon, r = 1) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

/* ------------------------------------------------------------------ */
/* Shaders                                                             */
/* ------------------------------------------------------------------ */

const DOTS_VERT = /* glsl */ `
uniform float uSize;
uniform float uTime;
attribute float aLand;
attribute float aRand;
varying float vLand;
varying float vRand;
varying float vFacing;
varying float vLat;

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * position);
  vFacing = dot(n, normalize(-mv.xyz));
  vLand = aLand;
  vRand = aRand;
  vLat = position.y * 0.5 + 0.5;
  // Respiration légère des points de terre
  float pulse = 1.0 + 0.22 * aLand * sin(uTime * 1.5 + aRand * 6.2831);
  gl_PointSize = uSize * mix(0.55, 1.0, aLand) * pulse / -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const DOTS_FRAG = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform float uTime;
varying float vLand;
varying float vRand;
varying float vFacing;
varying float vLat;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float soft = 1.0 - smoothstep(0.2, 0.5, d);
  // Violet au sud, cyan au nord, quelques étincelles roses sur les terres
  vec3 col = mix(uColorA, uColorB, smoothstep(0.15, 0.85, vLat));
  col = mix(col, uColorC, step(0.965, vRand) * vLand);
  float twinkle = 0.7 + 0.3 * sin(uTime * 2.0 + vRand * 40.0);
  float limb = smoothstep(-0.05, 0.45, vFacing);
  float alpha = soft * mix(0.22, 1.0, vLand) * twinkle * mix(0.25, 1.0, limb);
  gl_FragColor = vec4(col, alpha);
}
`;

const CORE_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const CORE_FRAG = /* glsl */ `
uniform vec3 uBase;
uniform vec3 uRim;
varying vec3 vN;
varying vec3 vV;

void main() {
  float f = 1.0 - max(dot(normalize(vN), normalize(vV)), 0.0);
  vec3 col = uBase + uRim * pow(f, 2.5) * 0.55;
  gl_FragColor = vec4(col, 1.0);
}
`;

const HALO_VERT = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const HALO_FRAG = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uHalf;
uniform float uIntensity;
varying vec2 vUv;

void main() {
  vec2 p = (vUv - 0.5) * 2.0 * uHalf;
  float r = length(p);
  float outer = 1.0 - smoothstep(1.0, 1.4, r);
  float inner = smoothstep(0.9, 1.01, r);
  vec3 col = mix(uColorA, uColorB, clamp(p.y * 0.5 + 0.5, 0.0, 1.0));
  gl_FragColor = vec4(col, outer * inner * uIntensity);
}
`;

const ARC_VERT = /* glsl */ `
varying float vU;

void main() {
  vU = uv.x;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const ARC_FRAG = /* glsl */ `
uniform float uTime;
uniform float uOffset;
uniform float uSpeed;
uniform float uReveal;
uniform vec3 uColorA;
uniform vec3 uColorB;
varying float vU;

void main() {
  // Tracé progressif à l'apparition
  float drawn = 1.0 - smoothstep(uReveal - 0.04, uReveal, vU);
  // Comète qui parcourt l'arc (tête de -0.25 à 1.25 pour entrer et sortir en entier)
  float head = fract(uTime * uSpeed + uOffset) * 1.5 - 0.25;
  float d = head - vU;
  float tail = (1.0 - smoothstep(0.0, 0.3, d)) * step(0.0, d);
  vec3 col = mix(uColorA, uColorB, vU);
  float alpha = (0.16 + tail * 1.2) * drawn;
  gl_FragColor = vec4(col * (1.0 + tail * 0.8), alpha);
}
`;

/* ------------------------------------------------------------------ */
/* Globe 3D                                                            */
/* ------------------------------------------------------------------ */

const CAM_Z = 10;
const FOV = 35;
const TILT = 0.38; // inclinaison au repos (on voit l'hémisphère nord)
const AUTO_SPEED = 0.09; // rad/s

function createGlobe(canvas, anchorEl, heroEl) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (err) {
    return null; // WebGL indisponible
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, CAM_Z);

  const anchor = new THREE.Group(); // position + échelle, sans rotation
  const globe = new THREE.Group(); // rotation
  anchor.add(globe);
  scene.add(anchor);

  const disposables = [];
  const time = { value: 0 };

  // --- Noyau sombre : masque l'arrière du globe ---
  const coreGeo = new THREE.SphereGeometry(0.985, 64, 48);
  const coreMat = new THREE.ShaderMaterial({
    vertexShader: CORE_VERT,
    fragmentShader: CORE_FRAG,
    uniforms: {
      uBase: { value: hexToRGB(0x08071a) },
      uRim: { value: hexToRGB(COLORS.violet) },
    },
  });
  globe.add(new THREE.Mesh(coreGeo, coreMat));
  disposables.push(coreGeo, coreMat);

  // --- Halo autour du globe (plan face caméra, ne tourne pas) ---
  const HALO_HALF = 1.7;
  const haloGeo = new THREE.PlaneGeometry(HALO_HALF * 2, HALO_HALF * 2);
  const haloMat = new THREE.ShaderMaterial({
    vertexShader: HALO_VERT,
    fragmentShader: HALO_FRAG,
    uniforms: {
      uColorA: { value: hexToRGB(COLORS.violet) },
      uColorB: { value: hexToRGB(COLORS.cyan) },
      uHalf: { value: HALO_HALF },
      uIntensity: { value: 0.32 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  anchor.add(new THREE.Mesh(haloGeo, haloMat));
  disposables.push(haloGeo, haloMat);

  // --- Points (sphère de Fibonacci) ---
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const COUNT = small ? 9000 : 16000;
  const rand = mulberry32(2019);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const pos = [];
  const land = [];
  const rnd = [];
  for (let i = 0; i < COUNT; i++) {
    const y = 1 - (i / (COUNT - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    const lat = THREE.MathUtils.radToDeg(Math.asin(y));
    const lon = THREE.MathUtils.radToDeg(Math.atan2(z, -x)) - 180;
    const onLand = isLand(x, y, z, lat, lon);
    const rv = rand();
    // On garde toutes les terres et une poussière d'océan
    if (!onLand && rv > 0.11) continue;
    pos.push(x, y, z);
    land.push(onLand ? 1 : 0);
    rnd.push(rand());
  }
  const dotsGeo = new THREE.BufferGeometry();
  dotsGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  dotsGeo.setAttribute('aLand', new THREE.Float32BufferAttribute(land, 1));
  dotsGeo.setAttribute('aRand', new THREE.Float32BufferAttribute(rnd, 1));
  const dotsMat = new THREE.ShaderMaterial({
    vertexShader: DOTS_VERT,
    fragmentShader: DOTS_FRAG,
    uniforms: {
      uSize: { value: 30 },
      uTime: time,
      uColorA: { value: hexToRGB(COLORS.violet) },
      uColorB: { value: hexToRGB(COLORS.cyan) },
      uColorC: { value: hexToRGB(COLORS.rose) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  globe.add(new THREE.Points(dotsGeo, dotsMat));
  disposables.push(dotsGeo, dotsMat);

  // --- Villes : point + onde ---
  const Z_AXIS = new THREE.Vector3(0, 0, 1);
  const dotGeo = new THREE.CircleGeometry(0.022, 24);
  const ringGeo = new THREE.RingGeometry(0.026, 0.034, 40);
  disposables.push(dotGeo, ringGeo);
  const cityVecs = CITIES.map((c) => latLonToVec(c.lat, c.lon));
  const rings = CITIES.map((c, i) => {
    const color = c.hq ? COLORS.rose : COLORS.cyan;
    const q = new THREE.Quaternion().setFromUnitVectors(Z_AXIS, cityVecs[i]);
    const dotMat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.copy(cityVecs[i]).multiplyScalar(1.004);
    dot.quaternion.copy(q);
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(cityVecs[i]).multiplyScalar(1.006);
    ring.quaternion.copy(q);
    globe.add(dot, ring);
    disposables.push(dotMat, ringMat);
    return { ring, mat: ringMat, phase: i * 0.37, boost: 0 };
  });

  // --- Arcs entre bureaux ---
  const arcMats = LINKS.map(([a, b], i) => {
    const va = cityVecs[a];
    const vb = cityVecs[b];
    const angle = va.angleTo(vb);
    const lift = 0.06 + angle * 0.16;
    const pts = [];
    const SEG = 48;
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG;
      // Interpolation sphérique + bosse d'altitude
      const p = new THREE.Vector3()
        .addScaledVector(va, Math.sin((1 - t) * angle))
        .addScaledVector(vb, Math.sin(t * angle))
        .divideScalar(Math.sin(angle))
        .normalize()
        .multiplyScalar(1 + lift * Math.sin(Math.PI * t));
      pts.push(p);
    }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.005, 6, false);
    const mat = new THREE.ShaderMaterial({
      vertexShader: ARC_VERT,
      fragmentShader: ARC_FRAG,
      uniforms: {
        uTime: time,
        uOffset: { value: rand() },
        uSpeed: { value: 0.16 + rand() * 0.1 },
        uReveal: { value: 0 },
        uColorA: { value: hexToRGB(CITIES[a].hq ? COLORS.rose : COLORS.cyan) },
        uColorB: { value: hexToRGB(i % 2 ? COLORS.violet : COLORS.cyan) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    globe.add(new THREE.Mesh(geo, mat));
    disposables.push(geo, mat);
    return mat;
  });

  /* --- État & interactions --- */
  const state = {
    rotY: -1.2,
    rotX: TILT,
    velY: 0,
    dragging: false,
    lastX: 0,
    lastY: 0,
    lastT: 0,
    focusY: null,
    focusX: TILT,
    focusUntil: 0,
    scroll: 0,
    scrollSmooth: 0,
    elapsed: 0,
  };
  const base = { x: 0, y: 0, r: 1, px: 300 };

  function layout() {
    const cr = canvas.getBoundingClientRect();
    const ar = anchorEl.getBoundingClientRect();
    const w = Math.max(1, cr.width);
    const h = Math.max(1, cr.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const visH = 2 * CAM_Z * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const visW = visH * camera.aspect;
    const cx = ar.left + ar.width / 2 - cr.left;
    const cy = ar.top + ar.height / 2 - cr.top;
    base.x = (cx / w - 0.5) * visW;
    base.y = -(cy / h - 0.5) * visH;
    base.r = ((ar.width / 2) / h) * visH * 0.86;
    base.px = (ar.width / 2) * 0.86; // rayon à l'écran en pixels CSS
    base.visH = visH;
  }

  function focusCity(i) {
    const v = cityVecs[i];
    const target = Math.atan2(-v.x, v.z) - state.scrollSmooth * 1.4;
    // Angle équivalent le plus proche de la rotation actuelle
    const twoPi = Math.PI * 2;
    state.focusY = target + Math.round((state.rotY - target) / twoPi) * twoPi;
    state.focusX = clamp(THREE.MathUtils.degToRad(CITIES[i].lat), -0.9, 0.9);
    state.focusUntil = state.elapsed + 4;
    state.velY = 0;
    rings[i].boost = 1;
    if (!running) renderOnce();
  }

  // Glisser pour tourner (souris, stylet, doigt à l'horizontale)
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    state.dragging = true;
    state.focusY = null;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    state.lastT = performance.now();
    state.velY = 0;
    canvas.classList.add('is-dragging');
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* capture non dispo */ }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!state.dragging) return;
    const now = performance.now();
    const k = Math.PI / Math.max(120, base.px * 2);
    const dx = e.clientX - state.lastX;
    const dy = e.clientY - state.lastY;
    state.rotY += dx * k;
    state.rotX = clamp(state.rotX + dy * k, -0.9, 0.9);
    const dt = Math.max((now - state.lastT) / 1000, 0.008);
    state.velY = state.velY * 0.6 + ((dx * k) / dt) * 0.4;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    state.lastT = now;
    if (!running) renderOnce();
  });

  const endDrag = () => {
    if (!state.dragging) return;
    state.dragging = false;
    // Pas d'inertie si le doigt s'est arrêté avant de lâcher
    if (performance.now() - state.lastT > 80) state.velY = 0;
    state.velY = clamp(state.velY, -6, 6);
    canvas.classList.remove('is-dragging');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', endDrag);

  /* --- Boucle --- */
  let raf = 0;
  let running = false;
  let last = 0;
  let visible = true;
  const tmp = new THREE.Vector3();

  function update(dt) {
    const reduced = reducedQuery.matches;
    const motion = reduced ? 0.15 : 1;
    state.elapsed += dt;
    time.value += dt * motion;

    // Progression du scroll dans le hero (0 → 1)
    const hr = heroEl.getBoundingClientRect();
    state.scroll = reduced ? 0 : clamp(-hr.top / Math.max(1, hr.height), 0, 1);
    state.scrollSmooth += (state.scroll - state.scrollSmooth) * damp(6, dt);
    const s = state.scrollSmooth;

    if (state.focusY !== null && !state.dragging) {
      state.rotY += (state.focusY - state.rotY) * damp(3.5, dt);
      state.rotX += (state.focusX - state.rotX) * damp(3.5, dt);
      if (state.elapsed > state.focusUntil) state.focusY = null;
    } else if (!state.dragging) {
      state.rotY += (AUTO_SPEED * motion + state.velY) * dt;
      state.velY *= Math.exp(-2.5 * dt);
      state.rotX += (TILT - state.rotX) * damp(0.8, dt);
    }

    // Le scroll fait tourner, grossir et monter le globe
    globe.rotation.set(state.rotX + s * 0.25, state.rotY + s * 1.4, 0);
    const scale = base.r * (1 + s * 0.35);
    anchor.scale.setScalar(scale);
    anchor.position.set(base.x, base.y + s * base.visH * 0.12, 0);

    // Taille des points ~ proportionnelle au rayon affiché
    const pr = renderer.getPixelRatio();
    const dotPx = clamp(base.px * (1 + s * 0.35) * 0.0135, 1.6, 5.5);
    dotsMat.uniforms.uSize.value = dotPx * pr * CAM_Z;

    // Apparition des arcs
    const reveal = reduced ? 1.05 : clamp((state.elapsed - 0.8) / 1.6, 0, 1) * 1.05;
    for (let i = 0; i < arcMats.length; i++) {
      arcMats[i].uniforms.uReveal.value = clamp(reveal * 1.3 - i * 0.04, 0, 1.05);
    }

    // Ondes autour des villes
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      r.boost = Math.max(0, r.boost - dt * 0.4);
      const t = ((time.value * 0.45 + r.phase) % 1 + 1) % 1;
      const grow = 1 + t * (2.4 + r.boost * 3);
      r.ring.scale.setScalar(grow);
      r.mat.opacity = (1 - t) * (0.85 + r.boost);
      // Masque l'onde quand la ville passe derrière
      tmp.copy(cityVecs[i]).applyQuaternion(globe.quaternion);
      r.ring.visible = tmp.z > -0.1;
    }
  }

  function renderOnce() {
    update(0.016);
    renderer.render(scene, camera);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    update(dt);
    renderer.render(scene, camera);
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  // Pause quand le canvas est hors écran ou l'onglet caché
  const sync = () => (visible && !document.hidden ? start() : stop());
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      sync();
    }).observe(canvas);
  }
  document.addEventListener('visibilitychange', sync);

  // Redimensionnement
  const onResize = () => {
    layout();
    if (!running) renderOnce();
  };
  if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(heroEl);
  else window.addEventListener('resize', onResize);
  document.fonts?.ready?.then(onResize);

  // Perte du contexte WebGL : on bascule sur le globe CSS
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    stop();
    heroEl.classList.add('no-webgl');
  });

  // Libère la mémoire GPU en quittant la page (hors cache avant/arrière)
  window.addEventListener('pagehide', (e) => {
    if (e.persisted) return;
    stop();
    disposables.forEach((d) => d.dispose());
    renderer.dispose();
  });

  layout();
  sync();
  if (!running) renderOnce();

  return { focusCity };
}

/* ------------------------------------------------------------------ */
/* Hero : horloges des bureaux + boutons ville                         */
/* ------------------------------------------------------------------ */

function initOffices(globeApi) {
  const times = document.querySelectorAll('.st-office-time[data-tz]');
  const formatters = new Map();
  const tick = () => {
    const now = new Date();
    times.forEach((el) => {
      const tz = el.dataset.tz;
      try {
        if (!formatters.has(tz)) {
          formatters.set(tz, new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: tz }));
        }
        el.textContent = formatters.get(tz).format(now);
      } catch (err) {
        el.textContent = '';
      }
    });
  };
  tick();
  setInterval(tick, 20000);

  const buttons = document.querySelectorAll('.st-office[data-city]');
  buttons.forEach((btn) => {
    const city = CITIES[Number(btn.dataset.city)];
    if (city) btn.setAttribute('aria-label', `Centrer le globe sur ${city.name}`);
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.toggle('is-active', b === btn));
      globeApi?.focusCity(Number(btn.dataset.city));
    });
  });
}

/* ------------------------------------------------------------------ */
/* Apparitions au scroll                                               */
/* ------------------------------------------------------------------ */

function initReveals() {
  const items = document.querySelectorAll('[data-reveal]');
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
  );
  items.forEach((el) => io.observe(el));
}

/* ------------------------------------------------------------------ */
/* Effets liés au scroll : frise, manifeste, parallaxe                 */
/* ------------------------------------------------------------------ */

function splitWords(el) {
  const text = el.textContent.replace(/\s+/g, ' ').trim();
  el.textContent = '';
  const words = [];
  text.split(' ').forEach((word, i) => {
    if (i) el.appendChild(document.createTextNode(' '));
    const span = document.createElement('span');
    span.className = 'st-mw';
    span.textContent = word;
    el.appendChild(span);
    words.push(span);
  });
  return words;
}

function initScrollEffects() {
  const tl = document.getElementById('st-tl');
  const tlItems = tl ? [...tl.querySelectorAll('.st-tl-item')] : [];
  const manifesto = document.getElementById('st-manifesto-text');
  const words = manifesto ? splitWords(manifesto) : [];
  const parallax = [...document.querySelectorAll('[data-speed]')];
  let ticking = false;

  const update = () => {
    ticking = false;
    const vh = window.innerHeight;

    // Frise : la ligne se dessine jusqu'à 60 % de l'écran
    if (tl) {
      const r = tl.getBoundingClientRect();
      const line = vh * 0.6;
      const p = clamp((line - r.top) / Math.max(1, r.height), 0, 1);
      tl.style.setProperty('--tl', p.toFixed(4));
      tlItems.forEach((item) => {
        const dot = item.firstElementChild;
        const top = (dot || item).getBoundingClientRect().top;
        item.classList.toggle('is-lit', top < line);
      });
    }

    // Manifeste : les mots s'allument un à un
    if (words.length) {
      const r = manifesto.getBoundingClientRect();
      const p = clamp((vh * 0.85 - r.top) / (r.height + vh * 0.35), 0, 1);
      const lit = p * words.length;
      words.forEach((w, i) => {
        w.style.opacity = String(0.16 + 0.84 * clamp(lit - i, 0, 1));
      });
    }

    // Parallaxe légère, relative au centre de la section parente
    parallax.forEach((el) => {
      const host = el.parentElement.getBoundingClientRect();
      const offset = (host.top + host.height / 2 - vh / 2) * Number(el.dataset.speed || 0);
      el.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
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
}

/* ------------------------------------------------------------------ */
/* Compteurs                                                           */
/* ------------------------------------------------------------------ */

function initCounters() {
  const els = document.querySelectorAll('[data-count]');
  const animate = (el) => {
    const target = Number(el.dataset.count) || 0;
    const decimals = Number(el.dataset.decimals) || 0;
    const duration = 2000;
    const t0 = performance.now();
    const step = (now) => {
      const t = clamp((now - t0) / duration, 0, 1);
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t); // expo.out
      el.textContent = formatFr(target * eased, decimals);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        animate(entry.target);
      });
    },
    { threshold: 0.6 }
  );
  els.forEach((el) => {
    el.textContent = formatFr(0, Number(el.dataset.decimals) || 0);
    io.observe(el);
  });
}

/* ------------------------------------------------------------------ */
/* Équipe : avatars génératifs + retournement                          */
/* ------------------------------------------------------------------ */

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
  return el;
}

function buildAvatar(el, index) {
  const seed = el.dataset.seed || String(index);
  const rnd = mulberry32(hashString(seed));
  const h1 = Number(el.style.getPropertyValue('--h1')) || 260;
  const h2 = Number(el.style.getPropertyValue('--h2')) || 190;
  const id = `st-av-${index}`;
  const svg = svgEl('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true', focusable: 'false' });
  const defs = svgEl('defs', {});
  svg.appendChild(defs);
  const kind = index % 4;

  if (kind === 0) {
    // Anneaux concentriques décentrés
    const cx = 25 + rnd() * 50;
    const cy = 25 + rnd() * 50;
    for (let i = 0; i < 5; i++) {
      svg.appendChild(svgEl('circle', {
        cx, cy, r: 12 + i * 13,
        fill: 'none',
        stroke: `hsla(${i % 2 ? h1 : h2}, 100%, 85%, ${0.5 - i * 0.08})`,
        'stroke-width': 2 + rnd() * 5,
      }));
    }
  } else if (kind === 1) {
    // Bulles floues
    const f = svgEl('filter', { id: `${id}-blur`, x: '-50%', y: '-50%', width: '200%', height: '200%' });
    f.appendChild(svgEl('feGaussianBlur', { stdDeviation: 7 }));
    defs.appendChild(f);
    const g = svgEl('g', { filter: `url(#${id}-blur)` });
    [h1, h2, (h1 + h2) / 2 + 40].forEach((h) => {
      g.appendChild(svgEl('circle', {
        cx: 15 + rnd() * 70, cy: 15 + rnd() * 70, r: 18 + rnd() * 16,
        fill: `hsla(${h}, 95%, 62%, 0.85)`,
      }));
    });
    svg.appendChild(g);
  } else if (kind === 2) {
    // Soleil rayé
    const clip = svgEl('clipPath', { id: `${id}-clip` });
    const cx = 35 + rnd() * 30;
    const cy = 30 + rnd() * 30;
    clip.appendChild(svgEl('circle', { cx, cy, r: 30 }));
    defs.appendChild(clip);
    svg.appendChild(svgEl('circle', { cx, cy, r: 30, fill: `hsla(${h2}, 100%, 70%, 0.55)` }));
    const g = svgEl('g', { 'clip-path': `url(#${id}-clip)` });
    for (let y = cy - 30; y < cy + 30; y += 7) {
      g.appendChild(svgEl('rect', { x: 0, y: y + 3.5, width: 100, height: 3, fill: `hsla(${h1}, 80%, 30%, 0.55)` }));
    }
    svg.appendChild(g);
  } else {
    // Planète et anneau
    const grad = svgEl('radialGradient', { id: `${id}-planet`, cx: '35%', cy: '30%', r: '75%' });
    grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': `hsl(${h2}, 100%, 80%)` }));
    grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': `hsl(${h1}, 80%, 30%)` }));
    defs.appendChild(grad);
    const angle = -30 + rnd() * 60;
    svg.appendChild(svgEl('circle', { cx: 50, cy: 52, r: 24, fill: `url(#${id}-planet)` }));
    svg.appendChild(svgEl('ellipse', {
      cx: 50, cy: 52, rx: 44, ry: 10,
      fill: 'none', stroke: 'hsla(0, 0%, 100%, 0.55)', 'stroke-width': 2.5,
      transform: `rotate(${angle.toFixed(1)} 50 52)`,
    }));
    svg.appendChild(svgEl('circle', { cx: 18 + rnd() * 64, cy: 12 + rnd() * 14, r: 3 + rnd() * 3, fill: '#fff', opacity: 0.8 }));
  }

  // Grain de lumière commun
  svg.appendChild(svgEl('circle', { cx: 78, cy: 20, r: 1.6, fill: '#fff', opacity: 0.7 }));
  el.prepend(svg);
  el.closest('.st-member-inner')?.style.setProperty('--h', String(h1));
}

function initTeam() {
  document.querySelectorAll('.st-avatar').forEach(buildAvatar);

  const cards = [...document.querySelectorAll('.st-member-inner')];
  let lastPointer = 'mouse';
  cards.forEach((card) => {
    card.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType; });
    // Au doigt (pas de survol) : un tap retourne la carte
    card.addEventListener('click', () => {
      if (lastPointer === 'mouse') return;
      const flip = !card.classList.contains('is-flipped');
      cards.forEach((c) => c.classList.remove('is-flipped'));
      card.classList.toggle('is-flipped', flip);
    });
    // Au clavier : la carte se retourne au focus, Entrée ou Espace la remet à l'endroit
    card.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      card.classList.toggle('is-front');
    });
    card.addEventListener('blur', () => card.classList.remove('is-front'));
  });
}

/* ------------------------------------------------------------------ */
/* Outils : marquee généré depuis la liste accessible                  */
/* ------------------------------------------------------------------ */

function initMarquee() {
  const section = document.querySelector('.st-tools');
  const names = [...document.querySelectorAll('.st-tools-list li')].map((li) => li.textContent.trim());
  const rows = section ? section.querySelectorAll('.st-marquee-row') : [];
  if (!names.length || !rows.length) return;

  rows.forEach((row, r) => {
    // Deuxième ligne : ordre décalé pour varier
    const list = r % 2 ? [...names.slice(names.length / 2), ...names.slice(0, names.length / 2)] : names;
    const frag = document.createDocumentFragment();
    // Contenu doublé : l'animation à -50 % boucle sans couture
    for (let copy = 0; copy < 2; copy++) {
      list.forEach((name) => {
        const span = document.createElement('span');
        span.className = 'st-marquee-item';
        span.textContent = name;
        frag.appendChild(span);
      });
    }
    row.appendChild(frag);
  });
  section.classList.add('has-marquee');
}

/* ------------------------------------------------------------------ */
/* Démarrage                                                           */
/* ------------------------------------------------------------------ */

function initGlobeSafe() {
  const canvas = document.getElementById('st-globe');
  const anchor = document.getElementById('st-globe-anchor');
  const hero = document.getElementById('studio-hero');
  if (!canvas || !anchor || !hero) return null;
  try {
    const api = createGlobe(canvas, anchor, hero);
    if (!api) hero.classList.add('no-webgl');
    return api;
  } catch (err) {
    hero.classList.add('no-webgl');
    return null;
  }
}

function start() {
  initCommon();
  const reduced = reducedQuery.matches;
  const canObserve = 'IntersectionObserver' in window;

  // États masqués des reveals uniquement si on peut les révéler
  if (!reduced && canObserve) {
    document.documentElement.classList.add('st-ready');
    initReveals();
    initCounters();
    initScrollEffects();
  }
  if (!reduced) initMarquee();

  initTeam();
  const globeApi = initGlobeSafe();
  initOffices(globeApi);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
