// Scènes Three.js d'ORBITALE : fond "hero" plein écran + galerie d'objets au scroll.
import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/* Constantes & utilitaires                                            */
/* ------------------------------------------------------------------ */

const COLORS = {
  bg: 0x05050a,
  violet: 0x7c5cff,
  cyan: 0x00e5ff,
  rose: 0xff3d81,
};

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// Lissage indépendant du framerate
const damp = (k, dt) => 1 - Math.exp(-k * dt);

// Hex -> [r, g, b] en sRGB (pour les shaders custom, sortie brute)
const hexToRGB = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const motionScale = () => (reducedMotionQuery.matches ? 0.15 : 1);

// Pointeur partagé entre les deux scènes (souris uniquement)
const pointer = { x: 0, y: 0, active: false };
let pointerBound = false;
function bindPointer() {
  if (pointerBound) return;
  pointerBound = true;
  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      pointer.active = true;
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
    },
    { passive: true }
  );
}

// Cible "souris" : vraie souris, sinon mouvement autonome (mobile)
function pointerTarget(time, out) {
  if (pointer.active) {
    out.set(pointer.x, pointer.y);
  } else {
    out.set(Math.sin(time * 0.31) * 0.55, Math.cos(time * 0.23) * 0.4);
  }
  return out;
}

// Boucle requestAnimationFrame démarrable / arrêtable
function createLoop(tick) {
  let raf = 0;
  let running = false;
  let last = 0;
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    tick(dt);
  };
  return {
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
  };
}

function createRenderer(canvas, alpha) {
  try {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    return renderer;
  } catch (err) {
    // WebGL indisponible : le site reste lisible sans 3D
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* GLSL : bruit simplex 3D (Ashima Arts / Stefan Gustavson, MIT)       */
/* ------------------------------------------------------------------ */

const NOISE_GLSL = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

// Rotation de teinte autour de l'axe des gris
const HUE_GLSL = /* glsl */ `
vec3 hueShift(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}
`;

/* ------------------------------------------------------------------ */
/* HERO : objet central + particules + anneaux                         */
/* ------------------------------------------------------------------ */

const BLOB_VERTEX = /* glsl */ `
uniform float uTime;
uniform vec2 uMouse;
uniform float uIntensity;

varying vec3 vNormal;
varying vec3 vViewPos;
varying float vDisp;

${NOISE_GLSL}

// Déplacement radial pour une direction n (espace objet)
float displace(vec3 n) {
  float t = uTime * 0.22;
  float d = snoise(n * 1.35 + vec3(t, t * 0.8, -t * 0.6)) * 0.55;
  d += snoise(n * 3.1 - vec3(t * 1.3, -t, t * 0.7)) * 0.2;
  // Bosse attirée par la souris (en espace monde)
  vec3 wn = normalize(mat3(modelMatrix) * n);
  vec3 md = normalize(vec3(uMouse * 1.1, 1.0));
  d += smoothstep(0.6, 1.0, dot(wn, md)) * 0.35 * min(length(uMouse), 1.0);
  return d * 0.3 * uIntensity;
}

void main() {
  float r = length(position);
  vec3 n = normalize(position);

  // Repère tangent pour recalculer la normale par différences finies
  vec3 upRef = abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 tg = normalize(cross(n, upRef));
  vec3 bt = normalize(cross(n, tg));
  float eps = 0.012;

  float d0 = displace(n);
  vec3 p0 = n * (r + d0);
  vec3 n1 = normalize(n + tg * eps);
  vec3 n2 = normalize(n + bt * eps);
  vec3 p1 = n1 * (r + displace(n1));
  vec3 p2 = n2 * (r + displace(n2));
  vec3 nrm = normalize(cross(p1 - p0, p2 - p0));

  vDisp = d0;
  vNormal = normalize(normalMatrix * nrm);
  vec4 mv = modelViewMatrix * vec4(p0, 1.0);
  vViewPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const BLOB_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform float uHue;

varying vec3 vNormal;
varying vec3 vViewPos;
varying float vDisp;

${HUE_GLSL}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(-vViewPos);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 2.4);

  vec3 violet = vec3(0.486, 0.361, 1.0);
  vec3 cyan = vec3(0.0, 0.898, 1.0);
  vec3 rose = vec3(1.0, 0.239, 0.506);

  // Phase iridescente : angle de vue + relief + temps
  float ph = ndv * 1.6 + vDisp * 2.8 + uTime * 0.06;
  vec3 irid = 0.5 + 0.5 * cos(6.28318 * (ph + vec3(0.0, 0.33, 0.67)));

  vec3 base = mix(violet, cyan, irid.x);
  base = mix(base, rose, irid.y * 0.55);

  // Éclairage doux (espace vue)
  vec3 L = normalize(vec3(0.45, 0.8, 0.6));
  float diff = max(dot(N, L), 0.0);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 56.0);

  vec3 col = vec3(0.025, 0.018, 0.06);
  col += base * (0.14 + 0.5 * diff);
  col += mix(cyan, rose, irid.z) * fres * (0.95 + 0.35 * uIntensity);
  col += spec * 0.55;
  col = hueShift(col, uHue);

  gl_FragColor = vec4(col, 1.0);
}
`;

const PARTICLES_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uPixelRatio;
uniform float uSize;

attribute float aScale;
attribute float aSeed;
attribute vec3 aColor;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec3 p = position;
  // Dérive lente individuelle
  p.x += sin(uTime * 0.2 + aSeed * 6.2831) * 0.18;
  p.y += cos(uTime * 0.17 + aSeed * 12.0) * 0.18;
  p.z += sin(uTime * 0.13 + aSeed * 3.0) * 0.12;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  float dist = max(-mv.z, 0.1);
  gl_PointSize = min(uSize * aScale * uPixelRatio / dist, 14.0 * uPixelRatio);

  vColor = aColor;
  // Scintillement + fondu près de la caméra
  vAlpha = (0.55 + 0.45 * sin(uTime * (0.6 + aSeed) + aSeed * 40.0)) * smoothstep(0.6, 3.0, dist);
}
`;

const PARTICLES_FRAGMENT = /* glsl */ `
uniform float uHue;

varying vec3 vColor;
varying float vAlpha;

${HUE_GLSL}

void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = 1.0 - smoothstep(0.0, 0.5, d);
  a *= a * vAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(hueShift(vColor, uHue), a);
}
`;

export function initHero(canvas) {
  const noop = { setScroll() {} };
  if (!canvas) return noop;
  const renderer = createRenderer(canvas, false);
  if (!renderer) return noop;

  bindPointer();
  renderer.setClearColor(COLORS.bg, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  let baseZ = 7;
  camera.position.set(0, 0, baseZ);

  /* --- Objet central --- */
  const blobUniforms = {
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector2() },
    uIntensity: { value: 1 },
    uHue: { value: 0 },
  };
  const blob = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.6, 48),
    new THREE.ShaderMaterial({
      uniforms: blobUniforms,
      vertexShader: BLOB_VERTEX,
      fragmentShader: BLOB_FRAGMENT,
    })
  );
  blob.frustumCulled = false; // le déplacement dépasse la sphère englobante
  const blobPivot = new THREE.Group();
  blobPivot.add(blob);
  scene.add(blobPivot);

  /* --- Champ de particules --- */
  const COUNT = 4000;
  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const scales = new Float32Array(COUNT);
  const seeds = new Float32Array(COUNT);
  const palette = [
    hexToRGB(COLORS.violet),
    hexToRGB(COLORS.cyan),
    hexToRGB(COLORS.rose),
    [0.9, 0.9, 1.0],
  ];
  const weights = [0.38, 0.3, 0.2, 0.12];
  for (let i = 0; i < COUNT; i++) {
    // Nuage sphérique, plus dense vers l'intérieur
    const r = 3.2 + Math.pow(Math.random(), 0.7) * 13;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.75;
    positions[i * 3 + 2] = r * Math.cos(phi);

    let pick = Math.random();
    let c = palette[0];
    for (let k = 0; k < weights.length; k++) {
      if (pick < weights[k]) {
        c = palette[k];
        break;
      }
      pick -= weights[k];
    }
    colors.set(c, i * 3);
    scales[i] = 0.35 + Math.pow(Math.random(), 2.5) * 1.6;
    seeds[i] = Math.random();
  }
  const particlesGeo = new THREE.BufferGeometry();
  particlesGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particlesGeo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  particlesGeo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  particlesGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

  const particlesUniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uSize: { value: 30 },
    uHue: { value: 0 },
  };
  const particles = new THREE.Points(
    particlesGeo,
    new THREE.ShaderMaterial({
      uniforms: particlesUniforms,
      vertexShader: PARTICLES_VERTEX,
      fragmentShader: PARTICLES_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  const particlesPivot = new THREE.Group();
  particlesPivot.add(particles);
  scene.add(particlesPivot);

  /* --- Anneaux / orbites --- */
  const ringDefs = [
    { r: 2.35, color: COLORS.cyan, tilt: [1.15, 0.2], prec: 0.07, spin: 0.55, opacity: 0.55 },
    { r: 2.85, color: COLORS.violet, tilt: [1.9, -0.45], prec: -0.05, spin: -0.4, opacity: 0.45 },
    { r: 3.4, color: COLORS.rose, tilt: [1.4, 0.9], prec: 0.035, spin: 0.28, opacity: 0.35 },
  ];
  const rings = ringDefs.map((def) => {
    const pivot = new THREE.Group(); // précession
    const tilt = new THREE.Group(); // inclinaison fixe
    tilt.rotation.set(def.tilt[0], 0, def.tilt[1]);
    pivot.add(tilt);

    const ringMat = new THREE.MeshBasicMaterial({
      color: def.color,
      transparent: true,
      opacity: def.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    tilt.add(new THREE.Mesh(new THREE.TorusGeometry(def.r, 0.007, 6, 360), ringMat));

    // Petit satellite lumineux qui parcourt l'anneau
    const spinner = new THREE.Group();
    const sat = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 16, 16),
      new THREE.MeshBasicMaterial({
        color: def.color,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    sat.position.set(def.r, 0, 0);
    glow.position.copy(sat.position);
    spinner.add(sat, glow);
    spinner.rotation.z = Math.random() * Math.PI * 2;
    tilt.add(spinner);

    scene.add(pivot);
    return { def, pivot, spinner, mat: ringMat };
  });

  /* --- Redimensionnement --- */
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    camera.aspect = w / h;
    // En portrait, on recule pour garder l'objet entier
    baseZ = camera.aspect < 1 ? (7 / Math.max(camera.aspect, 0.5)) * 0.75 : 7;
    camera.updateProjectionMatrix();
    particlesUniforms.uPixelRatio.value = renderer.getPixelRatio();
  }
  resize();
  window.addEventListener('resize', resize);

  /* --- Animation --- */
  let time = 0;
  let scrollTarget = 0;
  let scroll = 0;
  const mouse = new THREE.Vector2();
  const mouseTarget = new THREE.Vector2();
  const lookTarget = new THREE.Vector3();

  const loop = createLoop((dt) => {
    const ms = motionScale();
    time += dt * ms;

    // Lissages
    scroll = lerp(scroll, scrollTarget, damp(4, dt));
    pointerTarget(time, mouseTarget);
    mouse.lerp(mouseTarget, damp(ms < 1 ? 1 : 2.5, dt));

    // Objet central : recule et tourne avec le scroll
    blobUniforms.uTime.value = time;
    blobUniforms.uMouse.value.copy(mouse);
    blobUniforms.uIntensity.value = 1 + scroll * 1.3 + Math.sin(time * 0.8) * 0.08;
    blobUniforms.uHue.value = scroll * 0.6;
    blob.rotation.y += dt * 0.12 * ms;
    blob.rotation.x += dt * 0.05 * ms;
    blobPivot.position.z = -scroll * 4.5;
    blobPivot.position.y = Math.sin(time * 0.6) * 0.06 + scroll * 0.6;
    blobPivot.rotation.set(scroll * Math.PI * 0.9, scroll * Math.PI * 1.4, 0);
    blobPivot.scale.setScalar(1 - scroll * 0.15);

    // Particules : rotation lente + parallaxe souris
    particlesUniforms.uTime.value = time;
    particlesUniforms.uHue.value = scroll * 0.6;
    particles.rotation.y += dt * 0.025 * ms;
    particlesPivot.rotation.x = lerp(particlesPivot.rotation.x, -mouse.y * 0.18 + scroll * 0.5, damp(3, dt));
    particlesPivot.rotation.y = lerp(particlesPivot.rotation.y, mouse.x * 0.25 + scroll * 1.2, damp(3, dt));

    // Anneaux
    for (const ring of rings) {
      ring.pivot.rotation.y += dt * ring.def.prec * ms;
      ring.spinner.rotation.z += dt * ring.def.spin * ms;
      ring.pivot.position.z = blobPivot.position.z;
      ring.mat.opacity = ring.def.opacity * (0.85 + 0.3 * scroll);
    }

    // Caméra : parallaxe douce + descente au scroll
    camera.position.x = lerp(camera.position.x, mouse.x * 0.7, damp(2.5, dt));
    camera.position.y = lerp(camera.position.y, mouse.y * 0.45 - scroll * 1.2, damp(2.5, dt));
    camera.position.z = lerp(camera.position.z, baseZ - scroll * 1.5, damp(2.5, dt));
    lookTarget.set(0, -scroll * 0.4, blobPivot.position.z * 0.5);
    camera.lookAt(lookTarget);

    renderer.render(scene, camera);
  });

  // Pause quand l'onglet est caché
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) loop.stop();
    else loop.start();
  });
  if (!document.hidden) loop.start();

  return {
    setScroll(p) {
      scrollTarget = clamp(Number(p) || 0, 0, 1);
    },
  };
}

/* ------------------------------------------------------------------ */
/* SHOWCASE : galerie de 4 objets                                      */
/* ------------------------------------------------------------------ */

const LABELS = ['01 — Tore', '02 — Cristal', '03 — Sphère liquide', '04 — Anneaux'];

// Environnement réfléchi généré à la volée (panneaux lumineux colorés)
function buildEnvironment(renderer) {
  const envScene = new THREE.Scene();
  const disposables = [];

  const roomGeo = new THREE.SphereGeometry(20, 32, 16);
  const roomMat = new THREE.MeshBasicMaterial({ color: 0x0b0a18, side: THREE.BackSide });
  envScene.add(new THREE.Mesh(roomGeo, roomMat));
  disposables.push(roomGeo, roomMat);

  const panelGeo = new THREE.PlaneGeometry(1, 1);
  disposables.push(panelGeo);
  const panels = [
    { color: COLORS.violet, boost: 3, pos: [-8, 4, 6], size: [8, 6] },
    { color: COLORS.cyan, boost: 3, pos: [8, -2, 5], size: [6, 8] },
    { color: COLORS.rose, boost: 3, pos: [0, -8, -6], size: [10, 4] },
    { color: 0xffffff, boost: 2.5, pos: [2, 9, 2], size: [8, 3] },
    { color: COLORS.violet, boost: 1.5, pos: [-4, 0, -10], size: [6, 6] },
  ];
  for (const p of panels) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color).multiplyScalar(p.boost), side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(panelGeo, mat);
    mesh.position.set(...p.pos);
    mesh.scale.set(p.size[0], p.size[1], 1);
    mesh.lookAt(0, 0, 0);
    envScene.add(mesh);
    disposables.push(mat);
  }

  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(envScene, 0.04).texture;
  pmrem.dispose();
  disposables.forEach((d) => d.dispose());
  return texture;
}

// Matériau physique déformé par bruit (sphère liquide)
function createLiquidMaterial(uniforms) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: COLORS.rose,
    metalness: 0.55,
    roughness: 0.14,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    iridescence: 0.8,
    iridescenceIOR: 1.35,
    transparent: true,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLiquidTime = uniforms.uLiquidTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uLiquidTime;
${NOISE_GLSL}
float liquidDisp(vec3 n) {
  float t = uLiquidTime * 0.45;
  float d = snoise(n * 1.6 + vec3(t, -t * 0.7, t * 0.5)) * 0.16;
  d += snoise(n * 3.4 + vec3(-t * 1.2, t, 0.0)) * 0.05;
  return d;
}`
      )
      .replace(
        '#include <beginnormal_vertex>',
        `float lqR = length(position);
vec3 lqN = normalize(position);
vec3 lqRef = abs(lqN.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
vec3 lqT = normalize(cross(lqN, lqRef));
vec3 lqB = normalize(cross(lqN, lqT));
vec3 lqN1 = normalize(lqN + lqT * 0.01);
vec3 lqN2 = normalize(lqN + lqB * 0.01);
vec3 liquidPos = lqN * (lqR + liquidDisp(lqN));
vec3 lqP1 = lqN1 * (lqR + liquidDisp(lqN1));
vec3 lqP2 = lqN2 * (lqR + liquidDisp(lqN2));
vec3 objectNormal = normalize(cross(lqP1 - liquidPos, lqP2 - liquidPos));
#ifdef USE_TANGENT
  vec3 objectTangent = vec3( tangent.xyz );
#endif`
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = liquidPos;');
  };
  return mat;
}

export function initShowcase(canvas, onLabel) {
  const noop = { setProgress() {} };
  if (!canvas) return noop;
  const renderer = createRenderer(canvas, true);
  if (!renderer) return noop;

  bindPointer();
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.environment = buildEnvironment(renderer);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  let baseZ = 6;
  camera.position.set(0, 0, baseZ);

  /* --- Lumières colorées en orbite --- */
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));
  const key = new THREE.DirectionalLight(0xffffff, 0.8);
  key.position.set(2, 3, 4);
  scene.add(key);
  const orbitLights = [
    { color: COLORS.violet, radius: 3.2, speed: 0.6, phase: 0, y: 1.2 },
    { color: COLORS.cyan, radius: 3.0, speed: -0.45, phase: 2.1, y: -1.0 },
    { color: COLORS.rose, radius: 3.4, speed: 0.35, phase: 4.2, y: 0.4 },
  ].map((def) => {
    const light = new THREE.PointLight(def.color, 28, 0, 2);
    scene.add(light);
    return { def, light };
  });

  const root = new THREE.Group(); // inclinaison souris
  scene.add(root);

  // Fabrique un "slot" : outer = transition, inner = rotation continue
  const items = [];
  function addItem(build) {
    const outer = new THREE.Group();
    const inner = new THREE.Group();
    outer.add(inner);
    root.add(outer);
    const materials = [];
    const spin = build(inner, (m, base = 1) => {
      materials.push({ m, base });
      return m;
    });
    items.push({ outer, inner, materials, spin });
  }

  /* 01 — Tore */
  addItem((inner, reg) => {
    const mesh = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.82, 0.27, 280, 40),
      reg(
        new THREE.MeshPhysicalMaterial({
          color: COLORS.violet,
          metalness: 0.85,
          roughness: 0.16,
          clearcoat: 1,
          clearcoatRoughness: 0.05,
          iridescence: 0.6,
          iridescenceIOR: 1.4,
          transparent: true,
        })
      )
    );
    inner.add(mesh);
    return (dt, t) => {
      inner.rotation.x += dt * 0.25;
      inner.rotation.y += dt * 0.35;
    };
  });

  /* 02 — Cristal */
  addItem((inner, reg) => {
    const geo = new THREE.OctahedronGeometry(1.0, 1);
    const crystal = new THREE.Mesh(
      geo,
      reg(
        new THREE.MeshPhysicalMaterial({
          color: COLORS.cyan,
          metalness: 0.2,
          roughness: 0.04,
          clearcoat: 1,
          clearcoatRoughness: 0.02,
          iridescence: 1,
          iridescenceIOR: 1.6,
          flatShading: true,
          emissive: 0x0a2a40,
          transparent: true,
        })
      )
    );
    crystal.scale.set(1, 1.45, 1);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      reg(
        new THREE.LineBasicMaterial({
          color: 0xbff8ff,
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
        0.55
      )
    );
    edges.scale.copy(crystal.scale).multiplyScalar(1.002);
    inner.add(crystal, edges);

    // Éclats qui orbitent autour du cristal
    const shardMat = reg(
      new THREE.MeshPhysicalMaterial({
        color: COLORS.violet,
        metalness: 0.4,
        roughness: 0.1,
        clearcoat: 1,
        flatShading: true,
        transparent: true,
      })
    );
    const shardGeo = new THREE.TetrahedronGeometry(0.12, 0);
    const shards = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(shardGeo, shardMat);
      const a = (i / 7) * Math.PI * 2;
      s.position.set(Math.cos(a) * 1.75, Math.sin(a * 2) * 0.5, Math.sin(a) * 1.75);
      s.rotation.set(a, a * 2, 0);
      shards.add(s);
    }
    inner.add(shards);
    return (dt) => {
      crystal.rotation.y += dt * 0.3;
      edges.rotation.y = crystal.rotation.y;
      shards.rotation.y -= dt * 0.4;
      shards.children.forEach((s) => {
        s.rotation.x += dt * 0.8;
        s.rotation.y += dt * 0.6;
      });
    };
  });

  /* 03 — Sphère liquide */
  const liquidUniforms = { uLiquidTime: { value: 0 } };
  addItem((inner, reg) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.08, 160, 160), reg(createLiquidMaterial(liquidUniforms)));
    mesh.frustumCulled = false;
    inner.add(mesh);
    return (dt, t) => {
      liquidUniforms.uLiquidTime.value = t;
      inner.rotation.y += dt * 0.2;
    };
  });

  /* 04 — Anneaux */
  addItem((inner, reg) => {
    const ringColors = [COLORS.violet, COLORS.cyan, COLORS.rose, COLORS.violet, COLORS.cyan];
    const ringsList = ringColors.map((color, i) => {
      const r = 1.4 - i * 0.2;
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.045, 24, 180),
        reg(
          new THREE.MeshPhysicalMaterial({
            color,
            metalness: 0.9,
            roughness: 0.18,
            clearcoat: 1,
            clearcoatRoughness: 0.05,
            transparent: true,
          })
        )
      );
      mesh.rotation.set(i * 0.6, i * 0.9, 0);
      inner.add(mesh);
      return { mesh, sx: 0.25 + i * 0.12, sy: 0.4 - i * 0.05 };
    });
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 48, 48),
      reg(
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: COLORS.rose,
          emissiveIntensity: 1.6,
          roughness: 0.3,
          transparent: true,
        })
      )
    );
    inner.add(core);
    return (dt, t) => {
      ringsList.forEach((ring, i) => {
        ring.mesh.rotation.x += dt * ring.sx * (i % 2 ? -1 : 1);
        ring.mesh.rotation.y += dt * ring.sy;
      });
      core.scale.setScalar(1 + Math.sin(t * 2) * 0.08);
    };
  });

  /* --- Redimensionnement (ResizeObserver) --- */
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    baseZ = camera.aspect < 1 ? (6 / Math.max(camera.aspect, 0.45)) * 0.8 : 6;
    camera.updateProjectionMatrix();
  }
  resize();
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
  } else {
    window.addEventListener('resize', resize);
  }

  /* --- Transitions entre objets --- */
  const N = items.length;
  // Plateaux : chaque objet reste stable une partie du segment
  function mapProgress(p) {
    const raw = clamp(p, 0, 1) * (N - 1);
    const i = Math.min(Math.floor(raw), N - 2);
    return i + smoothstep(0.2, 0.8, raw - i);
  }

  function layout(f) {
    items.forEach((it, i) => {
      const d = f - i; // < 0 : à venir, > 0 : passé
      const vis = 1 - smoothstep(0.1, 0.6, Math.abs(d));
      it.outer.visible = vis > 0.004;
      if (!it.outer.visible) return;
      const s = 0.25 + 0.75 * vis;
      it.outer.scale.setScalar(s);
      it.outer.position.y = d * 1.8;
      it.outer.rotation.set(d * 0.8, d * 2.4, d * 0.5);
      for (const { m, base } of it.materials) m.opacity = base * vis;
    });
  }

  let progressTarget = 0;
  let progress = 0;
  let activeIndex = 0;
  let time = 0;
  const tilt = new THREE.Vector2();
  const tiltTarget = new THREE.Vector2();
  layout(0);

  const loop = createLoop((dt) => {
    const ms = motionScale();
    time += dt * ms;

    progress = lerp(progress, progressTarget, damp(5, dt));
    const f = mapProgress(progress);
    layout(f);

    // Libellé : seulement au changement d'objet actif
    const idx = clamp(Math.round(f), 0, N - 1);
    if (idx !== activeIndex) {
      activeIndex = idx;
      if (typeof onLabel === 'function') onLabel(LABELS[idx]);
    }

    // Rotation permanente
    items.forEach((it) => {
      if (it.outer.visible) it.spin(dt * ms, time);
    });

    // Lumières en orbite
    for (const { def, light } of orbitLights) {
      const a = time * def.speed + def.phase;
      light.position.set(Math.cos(a) * def.radius, def.y + Math.sin(a * 0.7) * 0.6, Math.sin(a) * def.radius);
    }

    // Légère inclinaison selon la souris
    pointerTarget(time, tiltTarget);
    tilt.lerp(tiltTarget, damp(3, dt));
    root.rotation.x = -tilt.y * 0.25;
    root.rotation.y = tilt.x * 0.35;
    camera.position.z = lerp(camera.position.z, baseZ, damp(4, dt));

    renderer.render(scene, camera);
  });

  /* --- Rendu uniquement si visible --- */
  let inView = false;
  const update = () => {
    if (inView && !document.hidden) loop.start();
    else loop.stop();
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        inView = entries.some((e) => e.isIntersecting);
        if (inView) resize();
        update();
      },
      { rootMargin: '100px 0px' }
    );
    io.observe(canvas);
  } else {
    inView = true;
  }
  document.addEventListener('visibilitychange', update);
  update();

  return {
    setProgress(p) {
      progressTarget = clamp(Number(p) || 0, 0, 1);
    },
  };
}
