// Page Labo : bac à sable 3D (formes, matériaux, particules, orbite maison).
// Les réglages vivent dans le hash de l'URL pour pouvoir partager une création.
import * as THREE from 'three';
import { initCommon } from './common.js';

/* ------------------------------------------------------------------ */
/* Données                                                             */
/* ------------------------------------------------------------------ */

const SHAPES = {
  sphere: 'Sphère',
  torus: 'Tore',
  knot: 'Nœud',
  cube: 'Cube arrondi',
  ico: 'Icosaèdre',
  crystal: 'Cristal',
  ribbon: 'Ruban',
};

const MATERIALS = {
  holo: 'Holographique',
  chrome: 'Chrome',
  glass: 'Verre',
  wire: 'Fil de fer',
  points: 'Points',
  toon: 'Toon',
};

const BACKGROUNDS = { black: 'Noir', gradient: 'Dégradé', grid: 'Grille' };
const BG_INDEX = { black: 0, gradient: 1, grid: 2 };

const DEFAULTS = Object.freeze({
  shape: 'knot',
  material: 'holo',
  c1: '#7c5cff',
  c2: '#00e5ff',
  noise: 35,
  speed: 40,
  particles: 1200,
  bloom: true,
  bg: 'gradient',
});

const PRESETS = {
  neon: { label: 'Néon', shape: 'knot', material: 'wire', c1: '#ff3d81', c2: '#00e5ff', noise: 22, speed: 55, particles: 1600, bloom: true, bg: 'grid' },
  lave: { label: 'Lave', shape: 'sphere', material: 'toon', c1: '#ff4a1c', c2: '#ffc93c', noise: 90, speed: 18, particles: 900, bloom: true, bg: 'gradient' },
  glacier: { label: 'Glacier', shape: 'crystal', material: 'glass', c1: '#9fe8ff', c2: '#5b7cff', noise: 8, speed: 22, particles: 1400, bloom: true, bg: 'grid' },
  nebuleuse: { label: 'Nébuleuse', shape: 'torus', material: 'points', c1: '#7c5cff', c2: '#ff3d81', noise: 60, speed: 32, particles: 2800, bloom: true, bg: 'black' },
  or: { label: 'Or', shape: 'cube', material: 'chrome', c1: '#ffcc66', c2: '#ff8a3d', noise: 14, speed: 28, particles: 400, bloom: true, bg: 'gradient' },
  minimal: { label: 'Minimal', shape: 'ico', material: 'toon', c1: '#f2f0ff', c2: '#7c5cff', noise: 0, speed: 20, particles: 0, bloom: false, bg: 'black' },
};

const STATE_KEYS = ['shape', 'material', 'c1', 'c2', 'noise', 'speed', 'particles', 'bloom', 'bg'];
const RIPPLE_COUNT = 4;

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const lerp = (a, b, t) => a + (b - a) * t;
// Lissage indépendant du framerate
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const has = (obj, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const isHex = (s) => typeof s === 'string' && /^#?[0-9a-f]{6}$/i.test(s);
const normHex = (s) => `#${s.replace('#', '').toLowerCase()}`;

// Hex -> vecteur sRGB brut (pour les shaders maison, comme dans scene.js)
function hexToVec3(hex, out) {
  const n = parseInt(hex.slice(1), 16);
  return out.set(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// Teinte (degrés), saturation et luminosité (0..1) -> "#rrggbb"
function hslToHex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Formate un entier avec des espaces pour les milliers : 1200 -> "1 200"
const formatNumber = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const sameState = (a, b) => STATE_KEYS.every((k) => a[k] === b[k]);

/* ------------------------------------------------------------------ */
/* État <-> hash de l'URL                                              */
/* ------------------------------------------------------------------ */

function encodeState(s) {
  const p = new URLSearchParams();
  p.set('forme', s.shape);
  p.set('mat', s.material);
  p.set('c1', s.c1.slice(1));
  p.set('c2', s.c2.slice(1));
  p.set('bruit', String(s.noise));
  p.set('vitesse', String(s.speed));
  p.set('particules', String(s.particles));
  p.set('halo', s.bloom ? '1' : '0');
  p.set('fond', s.bg);
  return p.toString();
}

function decodeState(hash) {
  const p = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  if (!p.has('forme') && !p.has('mat')) return null;
  const s = { ...DEFAULTS };
  const int = (key, min, max, def) => {
    const v = parseInt(p.get(key), 10);
    return Number.isFinite(v) ? clamp(v, min, max) : def;
  };
  if (has(SHAPES, p.get('forme'))) s.shape = p.get('forme');
  if (has(MATERIALS, p.get('mat'))) s.material = p.get('mat');
  if (isHex(p.get('c1'))) s.c1 = normHex(p.get('c1'));
  if (isHex(p.get('c2'))) s.c2 = normHex(p.get('c2'));
  s.noise = int('bruit', 0, 100, DEFAULTS.noise);
  s.speed = int('vitesse', 0, 100, DEFAULTS.speed);
  s.particles = Math.round(int('particules', 0, 3000, DEFAULTS.particles) / 50) * 50;
  if (p.has('halo')) s.bloom = p.get('halo') !== '0';
  if (has(BACKGROUNDS, p.get('fond'))) s.bg = p.get('fond');
  return s;
}

/* ------------------------------------------------------------------ */
/* GLSL partagé                                                        */
/* ------------------------------------------------------------------ */

// Bruit simplex 3D (Ashima Arts / Stefan Gustavson, licence MIT)
const GLSL_NOISE = /* glsl */ `
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

// En-tête vertex : déformation (bruit + ondes de choc) et explosion en fragments
const GLSL_VERT_HEAD = /* glsl */ `
uniform float uTime;
uniform float uNoise;
uniform float uExplode;
uniform vec4 uRipples[${RIPPLE_COUNT}];
attribute vec3 aDisp;
attribute vec3 aCenter;
attribute vec4 aRand;
varying vec3 vLaboPos;
${GLSL_NOISE}
float laboLastField;

// Déplacement scalaire le long de aDisp
float laboField(vec3 p) {
  float d = 0.0;
  if (uNoise > 0.001) {
    float n = snoise(p * 1.4 + vec3(0.0, uTime * 0.22, uTime * 0.1)) * 0.65
            + snoise(p * 3.1 - vec3(uTime * 0.18)) * 0.3;
    d = n * uNoise * 0.42;
  }
  for (int i = 0; i < ${RIPPLE_COUNT}; i++) {
    vec4 r = uRipples[i];
    float t = uTime - r.w;
    if (t < 0.0 || t > 3.0) continue;
    float k = distance(p, r.xyz) - t * 1.7;
    d += exp(-k * k * 30.0) * cos(k * 22.0) * exp(-t * 1.25) * 0.17;
  }
  return d;
}

vec3 laboRotate(vec3 v, vec3 axis, float a) {
  float s = sin(a);
  float c = cos(a);
  return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
}

vec3 laboAxis() {
  return normalize(aRand.xyz + vec3(0.0001));
}

float laboSpin() {
  return uExplode * (aRand.w - 0.5) * 10.0;
}

vec3 laboTransform(vec3 p) {
  laboLastField = laboField(p);
  vec3 q = p + aDisp * laboLastField;
  if (uExplode > 0.0) {
    float e = uExplode;
    vec3 dir = normalize(aCenter + aRand.xyz * 0.7 + vec3(0.0001));
    q = aCenter + laboRotate(q - aCenter, laboAxis(), laboSpin()) * (1.0 - 0.4 * e)
      + dir * e * (1.0 + aRand.w * 2.6);
  }
  return q;
}

// Normale de la surface déformée, par différences finies
vec3 laboNormal(vec3 p, vec3 n) {
  vec3 t = normalize(abs(n.y) < 0.99 ? cross(n, vec3(0.0, 1.0, 0.0)) : cross(n, vec3(1.0, 0.0, 0.0)));
  vec3 b = cross(n, t);
  float eps = 0.012;
  vec3 p0 = p + aDisp * laboField(p);
  vec3 p1 = p + t * eps;
  p1 += aDisp * laboField(p1);
  vec3 p2 = p + b * eps;
  p2 += aDisp * laboField(p2);
  vec3 nn = normalize(cross(p1 - p0, p2 - p0));
  if (uExplode > 0.0) nn = laboRotate(nn, laboAxis(), laboSpin());
  return nn;
}
`;

// En-tête fragment : dissolution pendant les transitions
const GLSL_FRAG_HEAD = /* glsl */ `
uniform float uTime;
uniform float uDissolve;
uniform vec3 uC1;
uniform vec3 uC2;
varying vec3 vLaboPos;
${GLSL_NOISE}
`;

// Début du main() fragment : jette les pixels "dissous", calcule le liseré
const GLSL_DISSOLVE = /* glsl */ `
  float laboEdge = 0.0;
  if (uDissolve > 0.001) {
    float dn = snoise(vLaboPos * 2.6) * 0.5 + 0.5;
    float th = uDissolve * 1.25 - 0.1;
    if (dn < th) discard;
    laboEdge = 1.0 - smoothstep(0.0, 0.07, dn - th);
  }
`;

// Holographique / fil de fer : fresnel iridescent, mélange additif
const HOLO_VERT = /* glsl */ `
${GLSL_VERT_HEAD}
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vec3 n = laboNormal(position, normal);
  vec3 p = laboTransform(position);
  vLaboPos = position;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vPosW = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const HOLO_FRAG = /* glsl */ `
${GLSL_FRAG_HEAD}
uniform float uWire;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
${GLSL_DISSOLVE}
  vec3 V = normalize(cameraPosition - vPosW);
  vec3 N = normalize(vNormalW);
  if (!gl_FrontFacing) N = -N;
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 2.5);
  vec3 rainbow = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + fres * 0.9 + vLaboPos.y * 0.35 + uTime * 0.06));
  vec3 base = mix(uC1, uC2, clamp(0.5 + 0.5 * N.y, 0.0, 1.0));
  vec3 irid = mix(base, rainbow, 0.45);
  float scan = 0.85 + 0.15 * sin(vPosW.y * 60.0 - uTime * 3.0);
  vec3 col = base * 0.12 + irid * (0.15 + fres * 1.6) * scan;
  // Fil de fer : plus franc, moins de transparence
  vec3 wire = mix(uC1, uC2, fres) * (0.55 + fres * 0.9) + rainbow * 0.08;
  col = mix(col, wire, uWire);
  col += uC2 * laboEdge * 2.5;
  gl_FragColor = vec4(col, 1.0);
}
`;

// Nuage de points qui reprend la forme
const POINTS_VERT = /* glsl */ `
${GLSL_VERT_HEAD}
uniform float uPixelRatio;
uniform float uSize;
varying float vMix;
varying float vGlow;
void main() {
  vec3 p = laboTransform(position);
  vLaboPos = position;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uPixelRatio * (0.55 + aRand.w * 0.9) * (1.0 + uExplode * 0.6) / max(-mv.z, 0.1);
  vMix = aRand.w;
  vGlow = clamp(laboLastField * 4.0, -1.0, 1.0);
}
`;

const POINTS_FRAG = /* glsl */ `
${GLSL_FRAG_HEAD}
varying float vMix;
varying float vGlow;
void main() {
${GLSL_DISSOLVE}
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = 1.0 - smoothstep(0.0, 0.5, d);
  vec3 col = mix(uC1, uC2, clamp(vMix * 0.6 + vGlow * 0.5 + 0.2, 0.0, 1.0));
  col += vec3(pow(a, 6.0) * 0.6);
  col += uC2 * laboEdge * 2.0;
  gl_FragColor = vec4(col, a * 0.7);
}
`;

// Particules d'ambiance (coquille autour de l'objet)
const AMBIENT_VERT = /* glsl */ `
uniform float uTime;
uniform float uExplode;
uniform float uPixelRatio;
uniform float uSize;
attribute vec4 aRand;
varying float vMix;
varying float vAlpha;
void main() {
  vec3 p = position;
  float ang = uTime * (0.04 + aRand.x * 0.08);
  float s = sin(ang);
  float c = cos(ang);
  p.xz = mat2(c, -s, s, c) * p.xz;
  p.y += sin(uTime * 0.5 + aRand.y * 6.28318) * 0.15;
  p *= 1.0 + uExplode * (0.25 + aRand.x * 0.5);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (0.4 + aRand.z) * uPixelRatio / max(-mv.z, 0.1);
  vMix = aRand.w;
  vAlpha = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * (0.8 + aRand.x * 2.0) + aRand.y * 6.28318));
}
`;

const AMBIENT_FRAG = /* glsl */ `
uniform vec3 uC1;
uniform vec3 uC2;
varying float vMix;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = pow(1.0 - d * 2.0, 2.0) * vAlpha;
  vec3 col = mix(uC1, uC2, vMix) + 0.25;
  gl_FragColor = vec4(col, a);
}
`;

// Fond plein écran : noir, dégradé ou grille au sol (suit la caméra)
const BG_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.999, 1.0);
}
`;

const BG_FRAG = /* glsl */ `
uniform float uTime;
uniform int uMode;
uniform vec3 uC1;
uniform vec3 uC2;
uniform mat4 uInvProj;
varying vec2 vUv;

float laboHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 dirV = normalize(v.xyz / v.w);
  // Rotation inverse de la vue (matrice orthonormée : transposée)
  vec3 dir = normalize((vec4(dirV, 0.0) * viewMatrix).xyz);
  vec3 base = vec3(0.02, 0.02, 0.04);
  vec3 col = base;

  if (uMode == 1) {
    float h = dir.y;
    float az = atan(dir.z, dir.x);
    vec3 tint = mix(uC1, uC2, 0.5 + 0.5 * sin(az * 2.0 + uTime * 0.05));
    col = mix(base, tint * 0.32, smoothstep(-0.6, 0.9, h));
    col += uC2 * 0.12 * exp(-abs(h + 0.1) * 5.0);
    col = mix(col, base, 1.0 - smoothstep(-0.9, 0.2, h));
  } else if (uMode == 2) {
    col = mix(base, uC1 * 0.12, smoothstep(-0.1, 0.8, dir.y));
    // Sol à y = -1.9 : calcul hors branche pour garder des dérivées (fwidth) fiables
    float dy = abs(dir.y) < 0.001 ? -0.001 : dir.y;
    float t = (-1.9 - cameraPosition.y) / dy;
    vec3 hit = cameraPosition + dir * t;
    vec2 g = hit.xz * 0.75 + vec2(0.0, uTime * 0.25);
    vec2 fw = max(fwidth(g), vec2(0.0001));
    vec2 gd = abs(fract(g - 0.5) - 0.5) / fw;
    float line = 1.0 - min(min(gd.x, gd.y), 1.0);
    float fade = exp(-max(t, 0.0) * 0.09) * step(0.0, t);
    vec3 lc = mix(uC1, uC2, smoothstep(2.0, 14.0, t));
    col += (lc * line * 0.9 + uC2 * 0.05) * fade;
    col += mix(uC1, uC2, 0.5) * 0.18 * exp(-abs(dir.y + 0.02) * 18.0);
  }

  vec2 dv = vUv - 0.5;
  float vig = 1.0 - dot(dv, dv) * 1.1;
  col += (laboHash(gl_FragCoord.xy + fract(uTime)) - 0.5) * 0.012;
  gl_FragColor = vec4(col * vig, 1.0);
}
`;

// Ciel de l'environnement généré (reflets du chrome / verre)
const ENV_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const ENV_FRAG = /* glsl */ `
uniform vec3 uC1;
uniform vec3 uC2;
varying vec3 vDir;
void main() {
  float h = vDir.y;
  vec3 col = mix(vec3(0.01, 0.01, 0.02), uC1 * 0.6, smoothstep(-0.2, 1.0, h));
  col += uC2 * 0.9 * exp(-abs(h - 0.05) * 7.0);
  col += vec3(0.02);
  gl_FragColor = vec4(col, 1.0);
}
`;

/* ------------------------------------------------------------------ */
/* Géométries                                                          */
/* ------------------------------------------------------------------ */

// Cube aux arêtes arrondies : on "gonfle" une boîte subdivisée
function roundedBox(size, r, seg) {
  const geo = new THREE.BoxGeometry(size, size, size, seg, seg, seg);
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const h = size / 2 - r;
  const v = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    c.set(clamp(v.x, -h, h), clamp(v.y, -h, h), clamp(v.z, -h, h));
    v.sub(c);
    if (v.lengthSq() < 1e-12) v.fromBufferAttribute(nor, i);
    v.normalize();
    nor.setXYZ(i, v.x, v.y, v.z);
    pos.setXYZ(i, c.x + v.x * r, c.y + v.y * r, c.z + v.z * r);
  }
  return geo;
}

// Gemme hexagonale taillée
function crystalGeometry() {
  const pts = [
    [0, -1.55],
    [0.5, -0.85],
    [0.62, 0.5],
    [0.46, 0.98],
    [0, 1.7],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 6);
}

// Ruban : section elliptique très plate, balayée le long d'un anneau ondulé et vrillée
function ribbonGeometry(segU, segV) {
  const R = 1.05;
  const a = 0.36;
  const b = 0.045;
  const curve = (u, out) => out.set(Math.cos(u) * R, Math.sin(3 * u) * 0.32, Math.sin(u) * R);
  const positions = [];
  const normals = [];
  const indices = [];
  const c = new THREE.Vector3();
  const c1 = new THREE.Vector3();
  const c2 = new THREE.Vector3();
  const T = new THREE.Vector3();
  const N0 = new THREE.Vector3();
  const B0 = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Vector3();

  for (let i = 0; i <= segU; i++) {
    const u = (i / segU) * Math.PI * 2;
    curve(u, c);
    T.subVectors(curve(u + 0.001, c2), curve(u - 0.001, c1)).normalize();
    N0.crossVectors(T, up).normalize();
    B0.crossVectors(N0, T).normalize();
    // Deux tours complets de vrille : le ruban se referme sans couture
    const tw = 2 * u;
    const ct = Math.cos(tw);
    const st = Math.sin(tw);
    N.copy(N0).multiplyScalar(ct).addScaledVector(B0, st);
    B.copy(B0).multiplyScalar(ct).addScaledVector(N0, -st);
    for (let j = 0; j <= segV; j++) {
      const phi = (j / segV) * Math.PI * 2;
      const cp = Math.cos(phi);
      const sp = Math.sin(phi);
      positions.push(
        c.x + N.x * a * cp + B.x * b * sp,
        c.y + N.y * a * cp + B.y * b * sp,
        c.z + N.z * a * cp + B.z * b * sp
      );
      tmp.copy(N).multiplyScalar(cp / a).addScaledVector(B, sp / b).normalize();
      normals.push(tmp.x, tmp.y, tmp.z);
    }
  }
  const row = segV + 1;
  for (let i = 0; i < segU; i++) {
    for (let j = 0; j < segV; j++) {
      const ia = i * row + j;
      const ib = (i + 1) * row + j;
      const ic = (i + 1) * row + j + 1;
      const id = i * row + j + 1;
      indices.push(ia, ib, id, ib, ic, id);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);
  return geo;
}

function buildBase(shape, q) {
  const s = (n) => Math.max(8, Math.round(n * q));
  switch (shape) {
    case 'sphere':
      return { geo: new THREE.SphereGeometry(1.15, s(128), s(96)), faceted: false };
    case 'torus':
      return { geo: new THREE.TorusGeometry(0.85, 0.36, s(72), s(180)), faceted: false };
    case 'cube':
      return { geo: roundedBox(1.55, 0.32, s(28)), faceted: false };
    case 'ico':
      return { geo: new THREE.IcosahedronGeometry(1.25, 1), faceted: true, tess: 8 };
    case 'crystal':
      return { geo: crystalGeometry(), faceted: true, tess: 14 };
    case 'ribbon':
      return { geo: ribbonGeometry(s(420), 24), faceted: false };
    case 'knot':
    default:
      return { geo: new THREE.TorusKnotGeometry(0.72, 0.24, s(280), s(40)), faceted: false };
  }
}

/*
 * Prépare une géométrie pour les shaders du labo :
 * - non indexée (chaque triangle est un fragment indépendant pour l'explosion),
 * - triangles dégénérés retirés, orientation vérifiée,
 * - formes à facettes : normales plates + subdivision (pour que bruit et ondes se voient),
 * - attributs aDisp (direction de déformation), aCenter (centre du fragment), aRand.
 */
function prepareGeometry(shape, q) {
  const { geo, faceted, tess = 1 } = buildBase(shape, q);
  const src = geo.index ? geo.toNonIndexed() : geo;
  const P = src.attributes.position.array;
  const Nsrc = src.attributes.normal ? src.attributes.normal.array : null;

  const pos = [];
  const nor = [];
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const C = new THREE.Vector3();
  const nA = new THREE.Vector3();
  const nB = new THREE.Vector3();
  const nC = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const fn = new THREE.Vector3();
  const ref = new THREE.Vector3();

  const pushV = (v, n) => {
    pos.push(v.x, v.y, v.z);
    nor.push(n.x, n.y, n.z);
  };

  for (let t = 0; t < P.length; t += 9) {
    A.fromArray(P, t);
    B.fromArray(P, t + 3);
    C.fromArray(P, t + 6);
    fn.crossVectors(ab.subVectors(B, A), ac.subVectors(C, A));
    const len = fn.length();
    if (len < 1e-9) continue;
    fn.divideScalar(len);

    if (Nsrc && !faceted) {
      nA.fromArray(Nsrc, t);
      nB.fromArray(Nsrc, t + 3);
      nC.fromArray(Nsrc, t + 6);
      ref.copy(nA).add(nB).add(nC);
    } else {
      // Formes convexes centrées : la normale doit s'éloigner du centre
      ref.copy(A).add(B).add(C);
    }
    if (fn.dot(ref) < 0) {
      // Mauvais sens : on échange B et C
      ab.copy(B);
      B.copy(C);
      C.copy(ab);
      ab.copy(nB);
      nB.copy(nC);
      nC.copy(ab);
      fn.negate();
    }

    if (!faceted) {
      pushV(A, nA);
      pushV(B, nB);
      pushV(C, nC);
      continue;
    }

    // Subdivision plane du triangle en tess² petits triangles
    const n = tess;
    const pt = (i, j, out) =>
      out.copy(A).addScaledVector(ab.subVectors(B, A), i / n).addScaledVector(ac.subVectors(C, A), j / n);
    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    const p2 = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n - i; j++) {
        pushV(pt(i, j, p0), fn);
        pushV(pt(i + 1, j, p1), fn);
        pushV(pt(i, j + 1, p2), fn);
        if (i + j < n - 1) {
          pushV(pt(i + 1, j, p0), fn);
          pushV(pt(i + 1, j + 1, p1), fn);
          pushV(pt(i, j + 1, p2), fn);
        }
      }
    }
  }

  geo.dispose();
  if (src !== geo) src.dispose();

  const count = pos.length / 3;
  const position = new Float32Array(pos);
  const normal = new Float32Array(nor);
  const disp = new Float32Array(count * 3);
  const center = new Float32Array(count * 3);
  const rand = new Float32Array(count * 4);
  const v = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    if (faceted) {
      // Même position -> même direction : les facettes ne se décollent pas
      v.fromArray(position, i * 3).normalize();
    } else {
      v.fromArray(normal, i * 3);
    }
    v.toArray(disp, i * 3);
  }

  for (let t = 0; t < count; t += 3) {
    const cx = (position[t * 3] + position[t * 3 + 3] + position[t * 3 + 6]) / 3;
    const cy = (position[t * 3 + 1] + position[t * 3 + 4] + position[t * 3 + 7]) / 3;
    const cz = (position[t * 3 + 2] + position[t * 3 + 5] + position[t * 3 + 8]) / 3;
    v.randomDirection();
    const w = Math.random();
    for (let k = 0; k < 3; k++) {
      const vi = t + k;
      center[vi * 3] = cx;
      center[vi * 3 + 1] = cy;
      center[vi * 3 + 2] = cz;
      rand[vi * 4] = v.x;
      rand[vi * 4 + 1] = v.y;
      rand[vi * 4 + 2] = v.z;
      rand[vi * 4 + 3] = w;
    }
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.setAttribute('aDisp', new THREE.BufferAttribute(disp, 3));
  out.setAttribute('aCenter', new THREE.BufferAttribute(center, 3));
  out.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
  out.computeBoundingSphere();
  return out;
}

// Échantillonnage uniforme de la surface (pondéré par l'aire des triangles)
function sampleSurface(geom, count) {
  const P = geom.attributes.position.array;
  const N = geom.attributes.normal.array;
  const D = geom.attributes.aDisp.array;
  const triCount = P.length / 9;
  const cdf = new Float32Array(triCount);
  let total = 0;
  for (let t = 0; t < triCount; t++) {
    const o = t * 9;
    const abx = P[o + 3] - P[o];
    const aby = P[o + 4] - P[o + 1];
    const abz = P[o + 5] - P[o + 2];
    const acx = P[o + 6] - P[o];
    const acy = P[o + 7] - P[o + 1];
    const acz = P[o + 8] - P[o + 2];
    const cx = aby * acz - abz * acy;
    const cy = abz * acx - abx * acz;
    const cz = abx * acy - aby * acx;
    total += Math.sqrt(cx * cx + cy * cy + cz * cz) * 0.5;
    cdf[t] = total;
  }

  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const disp = new Float32Array(count * 3);
  const rand = new Float32Array(count * 4);
  const dir = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    // Recherche dichotomique du triangle
    const r = Math.random() * total;
    let lo = 0;
    let hi = triCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    let u = Math.random();
    let w = Math.random();
    if (u + w > 1) {
      u = 1 - u;
      w = 1 - w;
    }
    const a = 1 - u - w;
    const o = lo * 9;
    for (let k = 0; k < 3; k++) {
      pos[i * 3 + k] = P[o + k] * a + P[o + 3 + k] * u + P[o + 6 + k] * w;
      nor[i * 3 + k] = N[o + k] * a + N[o + 3 + k] * u + N[o + 6 + k] * w;
      disp[i * 3 + k] = D[o + k] * a + D[o + 3 + k] * u + D[o + 6 + k] * w;
    }
    dir.randomDirection();
    rand[i * 4] = dir.x;
    rand[i * 4 + 1] = dir.y;
    rand[i * 4 + 2] = dir.z;
    rand[i * 4 + 3] = Math.random();
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('aDisp', new THREE.BufferAttribute(disp, 3));
  // Un point est son propre "fragment"
  out.setAttribute('aCenter', new THREE.BufferAttribute(pos.slice(), 3));
  out.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
  out.computeBoundingSphere();
  return out;
}

function ambientGeometry(max) {
  const pos = new Float32Array(max * 3);
  const rand = new Float32Array(max * 4);
  const v = new THREE.Vector3();
  for (let i = 0; i < max; i++) {
    v.randomDirection().multiplyScalar(2.8 + Math.pow(Math.random(), 0.7) * 6.5);
    v.toArray(pos, i * 3);
    rand[i * 4] = Math.random();
    rand[i * 4 + 1] = Math.random();
    rand[i * 4 + 2] = Math.random();
    rand[i * 4 + 3] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
  return geo;
}

// Texture de halo : dégradé radial blanc -> transparent
function haloTexture() {
  const size = 128;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.08)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ------------------------------------------------------------------ */
/* Scène                                                               */
/* ------------------------------------------------------------------ */

function createLab(canvas, stage, opts) {
  const { isMobile, reduced, onFps, initial } = opts;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, powerPreference: 'high-performance' });
  } catch (err) {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.setClearColor(0x05050a, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);

  const motion = reduced ? 0.35 : 1;
  const quality = isMobile ? 0.6 : 1;
  const shellCount = isMobile ? 9000 : 20000;
  const ambientMax = 3000;
  const ambientScale = isMobile ? 0.4 : 1;

  // Uniformes partagés par tous les matériaux du labo
  const shared = {
    uTime: { value: 0 },
    uNoise: { value: 0.35 },
    uExplode: { value: 0 },
    uDissolve: { value: 1 },
    uRipples: { value: Array.from({ length: RIPPLE_COUNT }, () => new THREE.Vector4(0, 0, 0, -1000)) },
    uC1: { value: new THREE.Vector3() },
    uC2: { value: new THREE.Vector3() },
    uPixelRatio: { value: renderer.getPixelRatio() },
  };

  /* --- Lumières ---------------------------------------------------- */
  scene.add(new THREE.HemisphereLight(0xc8ccff, 0x120a1e, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 4, 5);
  const rim = new THREE.DirectionalLight(0x00e5ff, 1.8);
  rim.position.set(-4, -2, -3);
  scene.add(key, rim);

  /* --- Fond --------------------------------------------------------- */
  const bgMat = new THREE.ShaderMaterial({
    vertexShader: BG_VERT,
    fragmentShader: BG_FRAG,
    uniforms: {
      uTime: shared.uTime,
      uC1: shared.uC1,
      uC2: shared.uC2,
      uMode: { value: 1 },
      uInvProj: { value: camera.projectionMatrixInverse },
    },
    depthTest: false,
    depthWrite: false,
  });
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat);
  bg.frustumCulled = false;
  bg.renderOrder = -10;
  scene.add(bg);

  /* --- Environnement généré (reflets) ------------------------------ */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSkyMat = new THREE.ShaderMaterial({
    vertexShader: ENV_VERT,
    fragmentShader: ENV_FRAG,
    uniforms: { uC1: { value: new THREE.Vector3() }, uC2: { value: new THREE.Vector3() } },
    side: THREE.BackSide,
    depthWrite: false,
  });
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), envSkyMat));
  const panelGeo = new THREE.PlaneGeometry(1, 1);
  const makePanel = (color, w, h, x, y, z) => {
    const m = new THREE.Mesh(panelGeo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.scale.set(w, h, 1);
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    envScene.add(m);
    return m;
  };
  makePanel(new THREE.Color().setRGB(5, 5, 5), 7, 1.2, 0, 6, 2);
  makePanel(new THREE.Color().setRGB(2.5, 2.5, 2.5), 4, 2, 2, 1, 8);
  const envPanel1 = makePanel(new THREE.Color(), 2, 6, -7, 1, 0);
  const envPanel2 = makePanel(new THREE.Color(), 2, 5, 7, 0, -2);
  let envRT = null;
  let envTimer = 0;

  function regenerateEnv() {
    hexToVec3(state.c1, envSkyMat.uniforms.uC1.value);
    hexToVec3(state.c2, envSkyMat.uniforms.uC2.value);
    envPanel1.material.color.set(state.c1).multiplyScalar(3);
    envPanel2.material.color.set(state.c2).multiplyScalar(3);
    const rt = pmrem.fromScene(envScene, 0.03);
    if (envRT) envRT.dispose();
    envRT = rt;
    scene.environment = rt.texture;
  }

  /* --- Matériaux ---------------------------------------------------- */
  // Injecte déformation, explosion et dissolution dans un matériau Three.js standard
  function patch(mat) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = shared.uTime;
      shader.uniforms.uNoise = shared.uNoise;
      shader.uniforms.uExplode = shared.uExplode;
      shader.uniforms.uDissolve = shared.uDissolve;
      shader.uniforms.uRipples = shared.uRipples;
      shader.uniforms.uC1 = shared.uC1;
      shader.uniforms.uC2 = shared.uC2;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${GLSL_VERT_HEAD}`)
        .replace(
          '#include <beginnormal_vertex>',
          'vec3 objectNormal = laboNormal(position, normal);\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(tangent.xyz);\n#endif'
        )
        .replace('#include <begin_vertex>', 'vec3 transformed = laboTransform(position);\nvLaboPos = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${GLSL_FRAG_HEAD}`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${GLSL_DISSOLVE}`)
        .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb += uC2 * laboEdge * 2.5;');
    };
    return mat;
  }

  const holoUniforms = (wire) => ({ ...shared, uWire: { value: wire } });

  const toonRamp = new THREE.DataTexture(new Uint8Array([50, 120, 190, 255]), 4, 1, THREE.RedFormat);
  toonRamp.minFilter = THREE.NearestFilter;
  toonRamp.magFilter = THREE.NearestFilter;
  toonRamp.generateMipmaps = false;
  toonRamp.needsUpdate = true;

  const materials = {
    holo: new THREE.ShaderMaterial({
      vertexShader: HOLO_VERT,
      fragmentShader: HOLO_FRAG,
      uniforms: holoUniforms(0),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
    wire: new THREE.ShaderMaterial({
      vertexShader: HOLO_VERT,
      fragmentShader: HOLO_FRAG,
      uniforms: holoUniforms(1),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      wireframe: true,
    }),
    chrome: patch(
      new THREE.MeshPhysicalMaterial({
        metalness: 1,
        roughness: 0.12,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        iridescence: 0.25,
        envMapIntensity: 1.3,
        side: THREE.DoubleSide,
      })
    ),
    glass: patch(
      new THREE.MeshPhysicalMaterial({
        metalness: 0,
        roughness: 0.06,
        transmission: 1,
        thickness: 1.4,
        ior: 1.5,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        iridescence: 0.5,
        iridescenceIOR: 1.3,
        attenuationDistance: 2.5,
        envMapIntensity: 1.4,
      })
    ),
    toon: patch(new THREE.MeshToonMaterial({ gradientMap: toonRamp, emissiveIntensity: 0.12, side: THREE.DoubleSide })),
  };
  materials.toon.toneMapped = false;

  const pointsMat = new THREE.ShaderMaterial({
    vertexShader: POINTS_VERT,
    fragmentShader: POINTS_FRAG,
    uniforms: { ...shared, uSize: { value: isMobile ? 24 : 20 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const ambientMat = new THREE.ShaderMaterial({
    vertexShader: AMBIENT_VERT,
    fragmentShader: AMBIENT_FRAG,
    uniforms: {
      uTime: shared.uTime,
      uExplode: shared.uExplode,
      uPixelRatio: shared.uPixelRatio,
      uC1: shared.uC1,
      uC2: shared.uC2,
      uSize: { value: 44 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  /* --- Objets ------------------------------------------------------- */
  const geoCache = new Map();
  const cloudCache = new Map();
  const getGeometry = (shape) => {
    if (!geoCache.has(shape)) geoCache.set(shape, prepareGeometry(shape, quality));
    return geoCache.get(shape);
  };
  const getCloud = (shape) => {
    if (!cloudCache.has(shape)) cloudCache.set(shape, sampleSurface(getGeometry(shape), shellCount));
    return cloudCache.get(shape);
  };

  const group = new THREE.Group();
  scene.add(group);
  const mesh = new THREE.Mesh(getGeometry(initial.shape), materials.holo);
  mesh.frustumCulled = false;
  const shell = new THREE.Points(new THREE.BufferGeometry(), pointsMat);
  shell.frustumCulled = false;
  shell.visible = false;
  group.add(mesh, shell);

  const ambient = new THREE.Points(ambientGeometry(ambientMax), ambientMat);
  ambient.frustumCulled = false;
  scene.add(ambient);

  // Halo additif : un sprite derrière l'objet, un voile léger devant
  const haloTex = haloTexture();
  const haloBack = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: haloTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 })
  );
  const haloFront = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: haloTex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, opacity: 0.16 })
  );
  haloFront.renderOrder = 10;
  scene.add(haloBack, haloFront);

  /* --- État visuel --------------------------------------------------- */
  let state = { ...initial };
  let shownShape = '';
  let shownMaterial = '';
  let lastColors = '';
  let rippleIndex = 0;
  let paused = false;
  let simTime = 0;
  let haloPulse = 0;

  function showVisual() {
    mesh.geometry = getGeometry(state.shape);
    shownShape = state.shape;
    if (state.material === 'points') {
      shell.geometry = getCloud(state.shape);
      mesh.visible = false;
      shell.visible = true;
    } else {
      mesh.material = materials[state.material];
      mesh.visible = true;
      shell.visible = false;
    }
    shownMaterial = state.material;
    // Les ondes en cours n'ont plus de sens sur une nouvelle forme
    shared.uRipples.value.forEach((r) => r.set(0, 0, 0, -1000));
  }

  function applyColors() {
    const sig = state.c1 + state.c2;
    if (sig === lastColors) return;
    lastColors = sig;
    hexToVec3(state.c1, shared.uC1.value);
    hexToVec3(state.c2, shared.uC2.value);
    const white = new THREE.Color(1, 1, 1);
    materials.chrome.color.set(state.c1).lerp(white, 0.45);
    materials.glass.color.set(state.c1).lerp(white, 0.75);
    materials.glass.attenuationColor.set(state.c2).lerp(white, 0.35);
    materials.toon.color.set(state.c1);
    materials.toon.emissive.set(state.c2);
    rim.color.set(state.c2);
    haloBack.material.color.set(state.c1);
    haloFront.material.color.set(state.c2);
    clearTimeout(envTimer);
    envTimer = setTimeout(regenerateEnv, 120);
  }

  function setParams(next) {
    state = { ...next };
    applyColors();
    shared.uNoise.value = state.noise / 100;
    ambient.geometry.setDrawRange(0, Math.round(state.particles * ambientScale));
    ambient.visible = state.particles > 0;
    haloBack.visible = state.bloom;
    haloFront.visible = state.bloom;
    bgMat.uniforms.uMode.value = BG_INDEX[state.bg];
    if (state.shape !== shownShape || state.material !== shownMaterial) requestMorph();
  }

  /* --- Transition entre formes / matériaux (dissolution + échelle) -- */
  const morph = { phase: 'in', dissolve: 1 };
  const outDur = reduced ? 0.12 : 0.42;
  const inDur = reduced ? 0.15 : 0.6;

  function requestMorph() {
    if (morph.phase !== 'out') morph.phase = 'out';
  }

  function updateMorph(dt) {
    if (morph.phase === 'out') {
      morph.dissolve = Math.min(1, morph.dissolve + dt / outDur);
      if (morph.dissolve >= 1) {
        showVisual();
        morph.phase = 'in';
      }
    } else if (morph.phase === 'in') {
      morph.dissolve = Math.max(0, morph.dissolve - dt / inDur);
      if (morph.dissolve <= 0) morph.phase = 'idle';
    }
    shared.uDissolve.value = morph.dissolve;
    const s = 1 - 0.18 * easeInOutCubic(morph.dissolve);
    group.scale.setScalar(s);
  }

  /* --- Explosion ------------------------------------------------------ */
  let explodeT = -1;
  function explode() {
    if (explodeT >= 0 && explodeT < 0.6) return;
    explodeT = 0;
    haloPulse = 1;
    addRipple(new THREE.Vector3(0, 0, 0));
  }

  function updateExplode(dt) {
    if (explodeT < 0) return;
    explodeT += dt;
    const t = explodeT;
    let e;
    if (t < 0.35) e = easeOutCubic(t / 0.35);
    else if (t < 0.6) e = 1;
    else if (t < 2.0) e = 1 - easeInOutCubic((t - 0.6) / 1.4);
    else {
      e = 0;
      explodeT = -1;
    }
    // Mouvement réduit : explosion plus contenue
    shared.uExplode.value = e * (reduced ? 0.45 : 1);
  }

  /* --- Ondes de choc ------------------------------------------------- */
  function addRipple(localPoint) {
    shared.uRipples.value[rippleIndex].set(localPoint.x, localPoint.y, localPoint.z, shared.uTime.value);
    rippleIndex = (rippleIndex + 1) % RIPPLE_COUNT;
  }

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function hitTest(clientX, clientY) {
    if (shared.uExplode.value > 0.02) return false;
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    group.updateMatrixWorld();
    const hits = raycaster.intersectObject(mesh, false);
    if (!hits.length) return false;
    addRipple(mesh.worldToLocal(hits[0].point.clone()));
    haloPulse = Math.max(haloPulse, 0.5);
    return true;
  }

  /* --- Orbite caméra maison ------------------------------------------ */
  const ORBIT_DEFAULT = { theta: 0.5, phi: 1.22, radius: isMobile ? 6.6 : 5.6 };
  const orbit = {
    ...ORBIT_DEFAULT,
    targetRadius: ORBIT_DEFAULT.radius,
    vTheta: 0,
    vPhi: 0,
    dragging: false,
  };
  const pointers = new Map();
  let lastMove = 0;
  let pinchDist = 0;
  let pinchMid = 0;
  let tap = null;
  let engaged = false;

  const zoomBy = (factor) => {
    orbit.targetRadius = clamp(orbit.targetRadius * factor, 2.8, 10);
  };

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    engaged = true;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      /* capture indisponible : sans conséquence */
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    orbit.dragging = true;
    orbit.vTheta = 0;
    orbit.vPhi = 0;
    lastMove = performance.now();
    stage.classList.add('is-dragging');
    if (pointers.size === 1) {
      tap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
    } else {
      tap = null;
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchMid = (a.y + b.y) / 2;
    }
  }

  function onPointerMove(e) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const now = performance.now();
    const dtEv = Math.max((now - lastMove) / 1000, 1 / 240);
    lastMove = now;

    if (pointers.size >= 2) {
      p.x = e.clientX;
      p.y = e.clientY;
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = (a.y + b.y) / 2;
      if (pinchDist > 0 && d > 0) zoomBy(pinchDist / d);
      // Deux doigts vers le haut / le bas : inclinaison
      orbit.phi = clamp(orbit.phi - (mid - pinchMid) * 0.006, 0.25, Math.PI - 0.25);
      pinchDist = d;
      pinchMid = mid;
      return;
    }

    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    const dTheta = -dx * 0.0065;
    const dPhi = -dy * 0.0065;
    orbit.theta += dTheta;
    orbit.phi = clamp(orbit.phi + dPhi, 0.25, Math.PI - 0.25);
    orbit.vTheta = lerp(orbit.vTheta, dTheta / dtEv, 0.4);
    orbit.vPhi = lerp(orbit.vPhi, dPhi / dtEv, 0.4);
  }

  function onPointerUp(e) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    if (e.type === 'pointerup' && tap && tap.id === e.pointerId) {
      const moved = Math.hypot(e.clientX - tap.x, e.clientY - tap.y);
      if (moved < 6 && performance.now() - tap.t < 500) hitTest(e.clientX, e.clientY);
    }
    tap = null;
    // On repasse en rotation avec le doigt restant
    if (pointers.size === 1) pinchDist = 0;
    if (pointers.size === 0) {
      orbit.dragging = false;
      stage.classList.remove('is-dragging');
      // Relâché après une pause : pas d'élan
      if (performance.now() - lastMove > 90 || e.type === 'pointercancel') {
        orbit.vTheta = 0;
        orbit.vPhi = 0;
      }
    }
  }

  function onWheel(e) {
    if (!engaged && !e.ctrlKey) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    zoomBy(Math.exp(clamp(e.deltaY * unit, -200, 200) * 0.0012));
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  stage.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') engaged = false;
  });

  function updateOrbit(dt) {
    if (!orbit.dragging) {
      orbit.theta += orbit.vTheta * dt;
      orbit.phi += orbit.vPhi * dt;
      const k = Math.exp(-3.2 * dt);
      orbit.vTheta *= k;
      orbit.vPhi *= k;
      // Rebond doux sur les butées verticales
      if (orbit.phi < 0.25 || orbit.phi > Math.PI - 0.25) orbit.vPhi = 0;
      orbit.phi = clamp(orbit.phi, 0.25, Math.PI - 0.25);
    }
    orbit.radius = lerp(orbit.radius, orbit.targetRadius, damp(8, dt));
    camera.position.setFromSphericalCoords(orbit.radius, orbit.phi, orbit.theta);
    camera.lookAt(0, 0, 0);
  }

  function resetCamera() {
    Object.assign(orbit, ORBIT_DEFAULT, { targetRadius: ORBIT_DEFAULT.radius, vTheta: 0, vPhi: 0 });
  }

  /* --- Taille ---------------------------------------------------------- */
  function resize() {
    const w = Math.max(1, stage.clientWidth);
    const h = Math.max(1, stage.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Écran étroit : on recule un peu pour garder l'objet entier
    camera.fov = w / h < 0.8 ? 50 : 38;
    camera.updateProjectionMatrix();
    shared.uPixelRatio.value = renderer.getPixelRatio();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  resize();

  /* --- Boucle ----------------------------------------------------------- */
  const camDir = new THREE.Vector3();
  let raf = 0;
  let running = false;
  let last = 0;
  let fpsFrames = 0;
  let fpsTime = 0;

  function render() {
    renderer.render(scene, camera);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const sdt = paused ? 0 : dt * motion;
    simTime += sdt;
    shared.uTime.value = simTime;

    updateMorph(dt);
    updateExplode(paused ? 0 : dt);

    // Rotation propre de l'objet
    group.rotation.y += sdt * (state.speed / 100) * 1.6;
    group.rotation.x = Math.sin(simTime * 0.3) * 0.18;
    ambient.rotation.y -= sdt * 0.01;

    updateOrbit(dt);

    // Halo : toujours derrière l'objet, du point de vue de la caméra
    if (state.bloom) {
      haloPulse = Math.max(0, haloPulse - dt * 1.4);
      const breath = 1 + Math.sin(simTime * 1.3) * 0.04 + haloPulse * 0.35;
      const fade = 1 - morph.dissolve * 0.6;
      camDir.copy(camera.position).normalize();
      haloBack.position.copy(camDir).multiplyScalar(-1.8);
      haloBack.scale.setScalar(7.2 * breath);
      haloBack.material.opacity = (0.55 + haloPulse * 0.4) * fade;
      haloFront.scale.setScalar(4.2 * breath);
      haloFront.material.opacity = (0.14 + haloPulse * 0.25 + shared.uExplode.value * 0.2) * fade;
    }

    render();

    fpsFrames++;
    fpsTime += dt;
    if (fpsTime >= 0.5) {
      onFps?.(fpsFrames / fpsTime);
      fpsFrames = 0;
      fpsTime = 0;
    }
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

  // Pause hors écran / onglet caché
  let inView = true;
  const sync = () => (inView && !document.hidden ? start() : stop());
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      (entries) => {
        inView = entries[0].isIntersecting;
        sync();
      },
      { threshold: 0.01 }
    ).observe(stage);
  }
  document.addEventListener('visibilitychange', sync);

  // Premier état : apparition par dissolution
  setParams(state);
  showVisual();
  clearTimeout(envTimer);
  regenerateEnv();
  sync();

  return {
    setParams,
    explode,
    resetCamera,
    isInView: () => inView,
    setPaused(v) {
      paused = v;
    },
    isPaused: () => paused,
    // Capture : on rend puis on lit le tampon dans la même tâche
    capture() {
      render();
      return renderer.domElement.toDataURL('image/png');
    },
  };
}

/* ------------------------------------------------------------------ */
/* Interface                                                           */
/* ------------------------------------------------------------------ */

function initPage() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobileQuery = window.matchMedia('(max-width: 760px)');
  const isMobile = mobileQuery.matches || window.matchMedia('(pointer: coarse)').matches;

  const stage = document.getElementById('lab-stage');
  const canvas = document.getElementById('lab-canvas');
  const form = document.getElementById('lab-form');
  const panel = document.getElementById('lab-panel');
  const toggle = document.getElementById('lab-panel-toggle');
  const hudName = document.getElementById('lab-hud-name');
  const hudHint = document.getElementById('lab-hud-hint');
  const fpsEl = document.getElementById('lab-fps');
  const pauseBadge = document.getElementById('lab-pause-badge');
  const toastEl = document.getElementById('lab-toast');
  const fpsToggle = document.getElementById('lab-fps-toggle');
  if (!stage || !canvas || !form) return;

  let state = decodeState(location.hash) || { ...DEFAULTS };
  let showFps = false;

  /* --- Notification ------------------------------------------------- */
  let toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 2200);
  }

  /* --- Scène ---------------------------------------------------------- */
  const lab = createLab(canvas, stage, {
    isMobile,
    reduced,
    initial: state,
    onFps: (fps) => {
      if (showFps) fpsEl.textContent = `${Math.round(fps)} i/s`;
    },
  });
  if (!lab) {
    document.getElementById('lab-fallback').hidden = false;
    canvas.hidden = true;
  }

  // Aide contextuelle selon le type de pointeur
  if (window.matchMedia('(pointer: coarse)').matches) {
    hudHint.textContent = 'Glisser latéralement : orbite · Deux doigts : zoom et inclinaison · Toucher l’objet : onde de choc';
  }

  /* --- Panneau : ouvert en desktop, replié en mobile ----------------- */
  function setPanelOpen(open) {
    panel.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  }
  setPanelOpen(!mobileQuery.matches);
  toggle.addEventListener('click', () => setPanelOpen(!panel.classList.contains('is-open')));
  mobileQuery.addEventListener('change', (e) => setPanelOpen(!e.matches));

  /* --- Synchronisation formulaire <- état ---------------------------- */
  const els = form.elements;
  const outputs = {
    c1: document.getElementById('lab-c1-out'),
    c2: document.getElementById('lab-c2-out'),
    noise: document.getElementById('lab-noise-out'),
    speed: document.getElementById('lab-speed-out'),
    particles: document.getElementById('lab-particles-out'),
  };

  const setFill = (input) => {
    const min = Number(input.min) || 0;
    const max = Number(input.max) || 100;
    input.style.setProperty('--fill', `${((Number(input.value) - min) / (max - min)) * 100}%`);
  };

  function syncUI() {
    form.querySelectorAll('input[type="radio"]').forEach((r) => {
      r.checked = state[r.name] === r.value;
    });
    els.c1.value = state.c1;
    els.c2.value = state.c2;
    outputs.c1.textContent = state.c1;
    outputs.c2.textContent = state.c2;
    els.noise.value = state.noise;
    els.speed.value = state.speed;
    els.particles.value = state.particles;
    outputs.noise.textContent = `${state.noise} %`;
    outputs.speed.textContent = `${state.speed} %`;
    outputs.particles.textContent = formatNumber(state.particles);
    [els.noise, els.speed, els.particles].forEach(setFill);
    els.bloom.checked = state.bloom;
    hudName.textContent = `${SHAPES[state.shape]} · ${MATERIALS[state.material]}`;
    document.querySelectorAll('[data-preset]').forEach((card) => {
      const preset = PRESETS[card.dataset.preset];
      const active = Boolean(preset) && sameState(state, { ...DEFAULTS, ...preset });
      card.classList.toggle('is-active', active);
      card.setAttribute('aria-pressed', String(active));
    });
  }

  /* --- Hash de l'URL --------------------------------------------------- */
  let hashTimer = 0;
  let lastHash = '';
  function writeHash() {
    clearTimeout(hashTimer);
    const h = `#${encodeState(state)}`;
    lastHash = h;
    if (location.hash !== h) history.replaceState(null, '', h);
  }
  const scheduleHash = () => {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(writeHash, 250);
  };

  function setState(patch, { hash = true } = {}) {
    state = { ...state, ...patch };
    syncUI();
    lab?.setParams(state);
    if (hash) scheduleHash();
  }

  // Lien collé dans la barre d'adresse sur la même page
  window.addEventListener('hashchange', () => {
    if (location.hash === lastHash) return;
    const s = decodeState(location.hash);
    if (s) setState(s, { hash: false });
  });

  /* --- Entrées du formulaire ------------------------------------------ */
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement)) return;
    switch (t.name) {
      case 'shape':
      case 'material':
      case 'bg':
        if (t.checked) setState({ [t.name]: t.value });
        break;
      case 'c1':
      case 'c2':
        if (isHex(t.value)) setState({ [t.name]: normHex(t.value) });
        break;
      case 'noise':
      case 'speed':
      case 'particles':
        setState({ [t.name]: Number(t.value) });
        break;
      default:
        break;
    }
  });
  form.addEventListener('change', (e) => {
    const t = e.target;
    if (t === els.bloom) setState({ bloom: t.checked });
    if (t === fpsToggle) {
      showFps = t.checked;
      fpsEl.hidden = !showFps;
    }
  });

  /* --- Actions ------------------------------------------------------------ */
  function randomize() {
    const hue = Math.random() * 360;
    const shift = 90 + Math.random() * 120;
    setState({
      shape: pick(Object.keys(SHAPES).filter((s) => s !== state.shape)),
      material: pick(Object.keys(MATERIALS).filter((m) => m !== state.material)),
      c1: hslToHex(hue, 0.85 + Math.random() * 0.15, 0.55 + Math.random() * 0.12),
      c2: hslToHex((hue + shift) % 360, 0.9, 0.55 + Math.random() * 0.1),
      noise: Math.round(10 + Math.random() * 80),
      speed: Math.round(10 + Math.random() * 70),
      particles: Math.round((300 + Math.random() * 2400) / 50) * 50,
      bloom: Math.random() < 0.75,
      bg: pick(Object.keys(BACKGROUNDS)),
    });
  }

  function reset() {
    setState({ ...DEFAULTS });
    lab?.resetCamera();
    toast('Réglages réinitialisés');
  }

  function capture() {
    if (!lab) return;
    try {
      const url = lab.capture();
      const a = document.createElement('a');
      a.href = url;
      a.download = `orbitale-labo-${state.shape}-${state.material}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast('Capture enregistrée');
    } catch (err) {
      toast('Capture impossible dans ce navigateur');
    }
  }

  const fsSupported = Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  function toggleFullscreen() {
    if (!fsSupported) {
      toast('Plein écran indisponible sur cet appareil');
      return;
    }
    let res;
    if (fsElement()) res = (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else res = (stage.requestFullscreen || stage.webkitRequestFullscreen).call(stage);
    if (res && typeof res.catch === 'function') res.catch(() => toast('Plein écran refusé par le navigateur'));
  }
  const onFsChange = () => {
    const on = fsElement() === stage;
    document.querySelectorAll('[data-action="fullscreen"]').forEach((b) => {
      b.setAttribute('aria-pressed', String(on));
      b.textContent = on ? 'Quitter le plein écran' : 'Plein écran';
    });
  };
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);
  if (!fsSupported) {
    document.querySelectorAll('[data-action="fullscreen"]').forEach((b) => {
      b.disabled = true;
      b.title = 'Plein écran indisponible sur cet appareil';
    });
  }

  async function copyLink() {
    writeHash();
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast('Lien copié — collez-le où vous voulez');
    } catch (err) {
      // Repli : sélection d'un champ temporaire
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (e) {
        ok = false;
      }
      ta.remove();
      toast(ok ? 'Lien copié — collez-le où vous voulez' : 'Copie impossible : utilisez la barre d’adresse');
    }
  }

  function togglePause() {
    if (!lab) return;
    const p = !lab.isPaused();
    lab.setPaused(p);
    pauseBadge.hidden = !p;
    toast(p ? 'Animation en pause' : 'Animation relancée');
  }

  function doExplode() {
    lab?.explode();
  }

  const actions = {
    random: randomize,
    explode: doExplode,
    reset,
    capture,
    fullscreen: toggleFullscreen,
    copy: copyLink,
  };

  document.addEventListener('click', (e) => {
    const btn = e.target instanceof Element && e.target.closest('[data-action]');
    if (!btn) return;
    const fn = actions[btn.dataset.action];
    if (fn) fn();
  });

  /* --- Recettes ---------------------------------------------------------- */
  document.querySelectorAll('[data-preset]').forEach((card) => {
    card.addEventListener('click', () => {
      const preset = PRESETS[card.dataset.preset];
      if (!preset) return;
      const { label, ...values } = preset;
      setState({ ...DEFAULTS, ...values });
      lab?.resetCamera();
      toast(`Recette « ${label} » appliquée`);
      const r = stage.getBoundingClientRect();
      if (r.top < -r.height * 0.3 || r.bottom > window.innerHeight + r.height * 0.3) {
        stage.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      }
    });
  });

  /* --- Raccourcis clavier ------------------------------------------------ */
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    if (!lab || !lab.isInView()) return;
    const t = e.target;
    if (t instanceof Element && t.closest('input[type="text"], input[type="search"], textarea, select, [contenteditable]')) return;
    const k = e.key.toLowerCase();
    if (k === 'r') randomize();
    else if (k === 'e') doExplode();
    else if (k === 'f') toggleFullscreen();
    else if (e.key === ' ' || e.code === 'Space') {
      // L'espace garde son rôle natif sur les éléments interactifs
      if (t instanceof Element && t.closest('input, button, select, textarea, a, summary')) return;
      e.preventDefault();
      togglePause();
    }
  });

  // État initial
  syncUI();
  lab?.setParams(state);
  if (location.hash) writeHash();
}

/* ------------------------------------------------------------------ */
/* Apparitions au scroll (facultatives)                                */
/* ------------------------------------------------------------------ */

function initReveals() {
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!gsap || !ScrollTrigger || reduced) return;
  gsap.registerPlugin(ScrollTrigger);

  gsap.from('[data-lab-line]', { yPercent: 60, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: 0.1, delay: 0.2 });

  gsap.utils.toArray('[data-lab-reveal]').forEach((el) => {
    // Les transitions CSS sur transform freineraient GSAP : coupées le temps de l'apparition
    el.style.transition = 'none';
    gsap.from(el, {
      y: 40,
      opacity: 0,
      duration: 0.9,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
      onComplete: () => {
        gsap.set(el, { clearProps: 'transform,opacity' });
        el.style.transition = '';
      },
    });
  });

  document.fonts?.ready?.then(() => ScrollTrigger.refresh());
}

function start() {
  initCommon();
  initPage();
  initReveals();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
