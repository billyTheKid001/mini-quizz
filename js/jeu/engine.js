// ORBITE — moteur du jeu (Three.js) : tunnel, entités, collisions, caméra.
// La sonde reste en z = 0 : c'est le monde qui défile vers elle (+z).
// Collisions en coordonnées polaires : chaque obstacle se résume à un intervalle
// d'angle et une épaisseur en z, testés sur tout le trajet du pas (pas d'effet tunnel).
import * as THREE from 'three';
import { Particles, Trail, SpeedLines, makeGlowTexture, makeBeamTexture, rawColor } from './fx.js';

/* --- Réglages ------------------------------------------------------------ */
const TAU = Math.PI * 2;
const R = 6;                          // rayon du tunnel
const TRACK = R - 0.9;                // rayon de la trajectoire de la sonde
const PROBE = 0.32;                   // rayon de collision de la sonde
const PROBE_ANG = (PROBE / TRACK) * 0.8; // demi-largeur angulaire (hitbox indulgente)
const TUNNEL_LEN = 200;
const SPAWN_Z = -170;                 // les motifs naissent ici
const RECYCLE_Z = 12;                 // derrière la caméra : retour au pool
const STEP = 1 / 120;                 // pas de simulation fixe
const MAX_STEPS = 12;
const V0 = 30;                        // vitesse de départ (u/s)
const VMAX = 96;
const ACCEL = 0.85;                   // u/s gagnées chaque seconde
const TURN = 3.4;                     // vitesse angulaire max (rad/s)
const SHIELD_TIME = 14;               // durée du bouclier (s)
const SLOW_TIME = 6;                  // durée du ralenti (s)
const SLOW_SCALE = 0.55;
const TIER_DIST = 900;                // distance entre deux paliers
const ATTRACT_V = 18;                 // vitesse du mode démo (écrans titre / fin)
const DEATH_TIME = 1.15;
const DRAG_GAIN = TAU * 0.9;          // glisser toute la largeur ≈ 0,9 tour

const ARC_INNER = R * 0.42;
const BLOCK_W = 2.6;
const BLOCK_H = 1.9;
const BLOCK_D = 2.4;
const BLOCK_HALF = Math.atan(BLOCK_W / 2 / TRACK);
const LASER_HALF = 0.05;
const ORB_REACH = 0.85;               // distance de ramassage le long de la paroi

const PALETTES = [
  { name: 'Violet', a: 0x7c5cff, b: 0x00e5ff, obstacle: 0xff3d81 },
  { name: 'Cyan', a: 0x00e5ff, b: 0x3a7bff, obstacle: 0xff3d81 },
  { name: 'Magenta', a: 0xff3d81, b: 0x7c5cff, obstacle: 0x00e5ff },
  { name: 'Ambre', a: 0xffa53d, b: 0xff3d81, obstacle: 0x00e5ff },
  { name: 'Émeraude', a: 0x2dffb3, b: 0x00b3ff, obstacle: 0xff3d81 },
  { name: 'Aurore', a: 0xf2f0ff, b: 0x7c5cff, obstacle: 0xff3d81 },
];

// Motifs : poids relatif et difficulté minimale
const PATTERNS = [
  { id: 'gate', w: 34, min: 0 },
  { id: 'blocks', w: 24, min: 0 },
  { id: 'gate2', w: 14, min: 0.15 },
  { id: 'laser', w: 12, min: 0.12 },
  { id: 'spin', w: 12, min: 0.3 },
  { id: 'spiral', w: 8, min: 0 },
];

/* --- Outils ------------------------------------------------------------- */
function modTau(a) {
  a %= TAU;
  return a < 0 ? a + TAU : a;
}
// Ramène un angle dans [-π, π[
function wrap(a) {
  return modTau(a + Math.PI) - Math.PI;
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randSign = () => (Math.random() < 0.5 ? -1 : 1);

/* --- Shaders ------------------------------------------------------------- */
const TUNNEL_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
varying float vDepth;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 mv = viewMatrix * world;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const TUNNEL_FRAG = /* glsl */ `
uniform float uTravel;
uniform float uTime;
uniform float uSpeed;
uniform float uSlow;
uniform vec3 uColA;
uniform vec3 uColB;
varying vec2 vUv;
varying vec3 vWorld;
varying float vDepth;

// 1 sur les valeurs entières de x, 0 ailleurs (w = demi-épaisseur)
float gridLine(float x, float w) {
  float d = abs(fract(x) - 0.5);
  return smoothstep(0.5 - w, 0.5, d);
}

void main() {
  float along = (vWorld.z - uTravel) / 5.0;
  float rings = gridLine(along, 0.04);
  float ribs = gridLine(vUv.x * 20.0, 0.035);
  float pulse = gridLine(along / 6.0, 0.012);
  // périodes entières autour (4π, 14π) et le long (24 anneaux) : aucune couture
  float wave = 0.5 + 0.5 * sin(vUv.x * 12.566371 + along * 0.261799 + uTime * 0.5);
  vec3 col = mix(uColA, uColB, wave);
  float streak = smoothstep(0.92, 1.0, sin(vUv.x * 43.982297 + 1.3)) * uSpeed;
  float glow = rings * 0.85 + ribs * 0.4 + pulse * 1.6 + streak * 0.7;
  vec3 c = col * (0.05 + glow);
  float fog = smoothstep(16.0, 168.0, vDepth);
  c = mix(c, uColA * 0.06, fog);
  float grey = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(c, vec3(grey) * vec3(0.8, 0.85, 1.2), uSlow * 0.55);
  gl_FragColor = vec4(c, 1.0);
}`;

const OBJ_VERT = /* glsl */ `
varying vec2 vUv;
varying vec2 vLocal;
varying float vDepth;
void main() {
  vUv = uv;
  vLocal = position.xy;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

// Anneau : on ne garde que l'arc [uStart, uStart + uLen]
const ARC_FRAG = /* glsl */ `
uniform float uStart;
uniform float uLen;
uniform float uInner;
uniform float uOuter;
uniform vec3 uColor;
varying vec2 vLocal;
varying float vDepth;
void main() {
  float a = atan(vLocal.y, vLocal.x);
  float rel = mod(a - uStart, 6.2831853);
  if (rel > uLen) discard;
  float r = length(vLocal);
  float edgeArc = min(rel, uLen - rel) * r;
  float edgeRad = min(r - uInner, uOuter - r);
  float edge = 1.0 - smoothstep(0.0, 0.2, min(edgeArc, edgeRad));
  float hatch = step(0.5, fract((rel * r + r) * 0.7));
  float fog = 1.0 - smoothstep(40.0, 168.0, vDepth);
  vec3 c = uColor * (0.22 + hatch * 0.18 + edge * 1.7);
  gl_FragColor = vec4(c * fog, (0.6 + edge * 0.4) * fog);
}`;

// Bloc : arêtes lumineuses + un liseré intérieur
const BLOCK_FRAG = /* glsl */ `
uniform vec3 uColor;
varying vec2 vUv;
varying float vDepth;
void main() {
  float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float edge = 1.0 - smoothstep(0.0, 0.07, e);
  float inner = 1.0 - smoothstep(0.0, 0.02, abs(e - 0.18));
  float fog = 1.0 - smoothstep(40.0, 168.0, vDepth);
  vec3 c = uColor * (0.1 + edge * 1.6 + inner * 0.5);
  gl_FragColor = vec4(c * fog, 1.0);
}`;

/* ------------------------------------------------------------------------ */
/* Création du jeu                                                           */
/* ------------------------------------------------------------------------ */
export function createOrbite({ canvas, audio, reducedMotion = false, hooks = {} }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (err) {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x05050a, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x05050a, 40, 168);
  const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 260);
  const lookTarget = new THREE.Vector3();

  const glowTex = makeGlowTexture();
  const beamTex = makeBeamTexture();

  /* --- Couleurs : brutes pour les shaders, converties pour le reste ------ */
  const colA = rawColor(PALETTES[0].a);
  const colB = rawColor(PALETTES[0].b);
  const colObs = rawColor(PALETTES[0].obstacle);
  const tgtA = colA.clone();
  const tgtB = colB.clone();
  const tgtObs = colObs.clone();
  const colOrb = rawColor(0xffc94a);
  const colShield = rawColor(0x00e5ff);
  const colSlow = rawColor(0xb18cff);
  const colProbe = rawColor(0x00e5ff);
  const colWhite = rawColor(0xffffff);
  const colTrail = new THREE.Color();

  /* --- Tunnel ------------------------------------------------------------ */
  const tunnelGeo = new THREE.CylinderGeometry(R, R, TUNNEL_LEN, 72, 1, true);
  tunnelGeo.rotateX(Math.PI / 2);
  const tunnelMat = new THREE.ShaderMaterial({
    uniforms: {
      uTravel: { value: 0 },
      uTime: { value: 0 },
      uSpeed: { value: 0 },
      uSlow: { value: 0 },
      uColA: { value: colA },
      uColB: { value: colB },
    },
    vertexShader: TUNNEL_VERT,
    fragmentShader: TUNNEL_FRAG,
    side: THREE.BackSide,
  });
  const tunnel = new THREE.Mesh(tunnelGeo, tunnelMat);
  tunnel.position.z = 10 - TUNNEL_LEN / 2;
  tunnel.frustumCulled = false;
  scene.add(tunnel);

  // Lueur au bout du tunnel
  const coreMat = new THREE.SpriteMaterial({
    map: glowTex, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const farCore = new THREE.Sprite(coreMat);
  farCore.position.z = -178;
  farCore.scale.setScalar(26);
  scene.add(farCore);

  /* --- Sonde ------------------------------------------------------------- */
  const probe = new THREE.Group();
  const probeCore = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.26, 0),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  const probeGlowMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0x00e5ff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const probeGlow = new THREE.Sprite(probeGlowMat);
  probeGlow.scale.setScalar(2.4);
  const shieldMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff, wireframe: true, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const shieldBubble = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 1), shieldMat);
  shieldBubble.visible = false;
  probe.add(probeCore, probeGlow, shieldBubble);
  scene.add(probe);

  /* --- Effets ------------------------------------------------------------ */
  const particles = new Particles(reducedMotion ? 320 : 640);
  const trail = new Trail(44, TRACK);
  const speedLines = new SpeedLines(reducedMotion ? 24 : 70, R);
  scene.add(particles.points, trail.mesh, speedLines.lines);

  /* --- Pools d'entités (créés une fois, réutilisés) ---------------------- */
  const all = [];
  const arcs = [];
  const blocks = [];
  const lasers = [];
  const orbs = [];
  const powers = [];

  // Anneaux : un matériau par anneau (uStart/uLen propres), couleur partagée
  const arcGeo = new THREE.RingGeometry(ARC_INNER, R, 96, 1);
  const sharedObsColor = { value: colObs };
  for (let i = 0; i < 16; i++) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uStart: { value: 0 },
        uLen: { value: 1 },
        uInner: { value: ARC_INNER },
        uOuter: { value: R },
        uColor: sharedObsColor,
      },
      vertexShader: OBJ_VERT,
      fragmentShader: ARC_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(arcGeo, mat);
    register(arcs, { kind: 'arc', mesh, mat, hd: 0.25, start: 0, len: 0, spin: 0 });
  }

  // Blocs : géométrie et matériau partagés
  const blockGeo = new THREE.BoxGeometry(BLOCK_W, BLOCK_H, BLOCK_D);
  const blockMat = new THREE.ShaderMaterial({
    uniforms: { uColor: sharedObsColor },
    vertexShader: OBJ_VERT,
    fragmentShader: BLOCK_FRAG,
  });
  for (let i = 0; i < 40; i++) {
    register(blocks, { kind: 'block', mesh: new THREE.Mesh(blockGeo, blockMat), hd: BLOCK_D / 2, angle: 0 });
  }

  // Lasers : 3 rayons max, moyeu central
  const spokeLen = R * 0.88;
  const laserCoreGeo = new THREE.BoxGeometry(spokeLen, 0.12, 0.12);
  laserCoreGeo.translate(R - spokeLen / 2, 0, 0);
  const laserBeamGeo = new THREE.PlaneGeometry(spokeLen, 1.1);
  laserBeamGeo.translate(R - spokeLen / 2, 0, 0);
  const laserCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const laserBeamMat = new THREE.MeshBasicMaterial({
    map: beamTex, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const hubGeo = new THREE.IcosahedronGeometry(0.55, 1);
  for (let i = 0; i < 6; i++) {
    const group = new THREE.Group();
    const spokes = [];
    for (let k = 0; k < 3; k++) {
      const s = new THREE.Group();
      s.add(new THREE.Mesh(laserCoreGeo, laserCoreMat), new THREE.Mesh(laserBeamGeo, laserBeamMat));
      group.add(s);
      spokes.push(s);
    }
    group.add(new THREE.Mesh(hubGeo, laserBeamMat));
    register(lasers, { kind: 'laser', mesh: group, spokes, hd: 0.15, angle: 0, count: 2, spin: 0 });
  }

  // Orbes
  const orbGeo = new THREE.IcosahedronGeometry(0.28, 0);
  const orbMat = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
  const orbGlowMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xffc94a, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  for (let i = 0; i < 64; i++) {
    const group = new THREE.Group();
    const core = new THREE.Mesh(orbGeo, orbMat);
    const glow = new THREE.Sprite(orbGlowMat);
    glow.scale.setScalar(1.7);
    group.add(core, glow);
    register(orbs, { kind: 'orb', mesh: group, core, hd: 0.5, angle: 0, taken: false, missed: false });
  }

  // Bonus : bouclier (octaèdre) ou ralenti (anneau)
  const shieldGeo = new THREE.OctahedronGeometry(0.42, 0);
  const slowGeo = new THREE.TorusGeometry(0.34, 0.09, 8, 24);
  const shieldCoreMat = new THREE.MeshBasicMaterial({ color: 0x9ff6ff, wireframe: true });
  const slowCoreMat = new THREE.MeshBasicMaterial({ color: 0xd9ccff });
  const shieldGlowMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0x00e5ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const slowGlowMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xb18cff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  for (let i = 0; i < 4; i++) {
    const group = new THREE.Group();
    const shieldMesh = new THREE.Mesh(shieldGeo, shieldCoreMat);
    const slowMesh = new THREE.Mesh(slowGeo, slowCoreMat);
    const glow = new THREE.Sprite(shieldGlowMat);
    glow.scale.setScalar(2.6);
    group.add(shieldMesh, slowMesh, glow);
    register(powers, { kind: 'power', mesh: group, shieldMesh, slowMesh, glow, hd: 0.55, angle: 0, type: 'shield' });
  }

  function register(list, e) {
    e.active = false;
    e.z = 0;
    e.mesh.visible = false;
    list.push(e);
    all.push(e);
    scene.add(e.mesh);
  }

  function take(list) {
    for (let i = 0; i < list.length; i++) if (!list[i].active) return list[i];
    return null; // pool plein : la pièce est simplement omise
  }

  function release(e) {
    e.active = false;
    e.mesh.visible = false;
  }

  function clearEntities() {
    for (let i = 0; i < all.length; i++) release(all[i]);
  }

  /* --- Apparition --------------------------------------------------------- */
  function spawnArc(z, start, len, spin) {
    const e = take(arcs);
    if (!e) return;
    e.active = true;
    e.z = z;
    e.start = modTau(start);
    e.len = len;
    e.spin = spin;
    e.mat.uniforms.uStart.value = e.start;
    e.mat.uniforms.uLen.value = len;
    e.mesh.position.set(0, 0, z);
    e.mesh.visible = true;
  }

  function spawnBlock(z, angle) {
    const e = take(blocks);
    if (!e) return;
    e.active = true;
    e.z = z;
    e.angle = angle;
    const r = R - BLOCK_H / 2;
    e.mesh.position.set(Math.cos(angle) * r, Math.sin(angle) * r, z);
    e.mesh.rotation.z = angle - Math.PI / 2; // l'axe y local pointe vers la paroi
    e.mesh.visible = true;
  }

  function spawnLaser(z, angle, count, spin) {
    const e = take(lasers);
    if (!e) return;
    e.active = true;
    e.z = z;
    e.angle = angle;
    e.count = count;
    e.spin = spin;
    for (let k = 0; k < 3; k++) {
      e.spokes[k].visible = k < count;
      e.spokes[k].rotation.z = (k * TAU) / count;
    }
    e.mesh.position.set(0, 0, z);
    e.mesh.rotation.z = angle;
    e.mesh.visible = true;
  }

  function spawnOrb(z, angle) {
    const e = take(orbs);
    if (!e) return;
    e.active = true;
    e.z = z;
    e.angle = angle;
    e.taken = false;
    e.missed = false;
    e.mesh.position.set(Math.cos(angle) * TRACK, Math.sin(angle) * TRACK, z);
    e.mesh.visible = true;
  }

  function spawnPower(z, angle, type) {
    const e = take(powers);
    if (!e) return;
    e.active = true;
    e.z = z;
    e.angle = angle;
    e.type = type;
    e.shieldMesh.visible = type === 'shield';
    e.slowMesh.visible = type === 'slow';
    e.glow.material = type === 'shield' ? shieldGlowMat : slowGlowMat;
    e.mesh.position.set(Math.cos(angle) * TRACK, Math.sin(angle) * TRACK, z);
    e.mesh.visible = true;
  }

  /* --- État de partie ------------------------------------------------------ */
  let state = 'title';     // title | playing | paused | dying | over
  let clock = 0;
  let theta = -Math.PI / 2; // angle de la sonde (bas de l'écran au départ)
  let angVel = 0;
  let camAngle = theta;
  let travel = 0;
  let speed = ATTRACT_V;
  let baseV = V0;
  let timeScale = 1;
  let runTime = 0;
  let distance = 0;
  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  let mult = 1;
  let maxMult = 1;
  let orbCount = 0;
  let shield = 0;
  let slowT = 0;
  let invuln = 0;
  let tier = 0;
  let deathT = 0;
  let shake = 0;
  let fov = 68;
  let safe = theta;        // angle garanti libre du dernier motif
  let frontZ = 0;          // z du dernier motif généré (avance avec le monde)
  let lastKind = '';
  let lastMult = 1;
  const tmpAngles = new Float32Array(8);

  const input = { left: false, right: false, hold: 0, mouse: 0, mouseActive: false, drag: 0 };
  const hud = { score: 0, combo: 0, mult: 1, speed: 0, shield: 0, slow: 0, tier: 1, distance: 0 };

  function setState(s) {
    state = s;
    needsRender = true;
    if (hooks.onState) hooks.onState(s);
  }

  function emit(type, data) {
    if (hooks.onEvent) hooks.onEvent(type, data);
  }

  function setPalette(i) {
    const p = PALETTES[i % PALETTES.length];
    rawColor(p.a, tgtA);
    rawColor(p.b, tgtB);
    rawColor(p.obstacle, tgtObs);
  }

  const difficulty = () => clamp((baseV - V0) / (VMAX - V0), 0, 1);

  /* --- Générateur de motifs ------------------------------------------------ */
  function pickPattern(d) {
    if (lastKind === 'laser') return Math.random() < 0.5 ? 'spiral' : 'blocks';
    let total = 0;
    for (let i = 0; i < PATTERNS.length; i++) if (d >= PATTERNS[i].min) total += PATTERNS[i].w;
    let r = Math.random() * total;
    for (let i = 0; i < PATTERNS.length; i++) {
      const p = PATTERNS[i];
      if (d < p.min) continue;
      r -= p.w;
      if (r <= 0) return p.id === 'spiral' && lastKind === 'spiral' ? 'gate' : p.id;
    }
    return 'gate';
  }

  // Remplit le tunnel jusqu'à SPAWN_Z ; l'écart dépend du temps de réaction voulu
  function generate() {
    for (let guard = 0; guard < 8; guard++) {
      const d = difficulty();
      const gap = baseV * lerp(1.0, 0.55, d) * lastMult;
      if (frontZ - gap < SPAWN_Z) break;
      const prevZ = frontZ;
      frontZ -= gap;
      lastMult = spawnPattern(frontZ, prevZ, gap, d);
    }
  }

  // Orbes posés entre deux motifs, du chemin sûr précédent vers le nouveau
  function orbChain(prevZ, z, fromA, toA, n, powerAt) {
    const delta = wrap(fromA - toA);
    for (let j = 1; j <= n; j++) {
      const f = j / (n + 1);
      const zz = z + (prevZ - z) * f;
      const a = toA + delta * f;
      if (j === powerAt) spawnPower(zz, a, pickPowerType());
      else spawnOrb(zz, a);
    }
  }

  function pickPowerType() {
    if (shield > 0) return 'slow';
    return Math.random() < 0.6 ? 'shield' : 'slow';
  }

  function placeBlocks(z, c, n, d) {
    let count = 0;
    for (let tries = 0; tries < 48 && count < n; tries++) {
      const a = Math.random() * TAU;
      // le chemin sûr garde une marge confortable
      if (Math.abs(wrap(a - c)) < BLOCK_HALF * 2 + 0.3) continue;
      let ok = true;
      for (let k = 0; k < count; k++) {
        if (Math.abs(wrap(a - tmpAngles[k])) < BLOCK_HALF * 2 + 0.08) { ok = false; break; }
      }
      if (!ok) continue;
      tmpAngles[count++] = a;
      spawnBlock(z + rand(-2, 2) * d, a);
    }
  }

  function spawnPattern(z, prevZ, gap, d) {
    const kind = pickPattern(d);
    // décalage angulaire atteignable pendant l'écart (avec marge)
    const reach = TURN * (gap / baseV) * 0.6;
    const from = safe;
    let next = 1;
    let chain = 3;

    switch (kind) {
      case 'gate': {
        const g = lerp(1.7, 1.0, d);
        const c = from + rand(-reach, reach);
        spawnArc(z, c + g / 2, TAU - g, 0);
        spawnOrb(z, c);
        safe = c;
        break;
      }
      case 'gate2': {
        const g = lerp(1.5, 0.95, d);
        const c = from + rand(-reach, reach);
        const c2 = c + Math.PI + rand(-0.6, 0.6);
        const len1 = modTau(c2 - g / 2 - (c + g / 2));
        spawnArc(z, c + g / 2, len1, 0);
        spawnArc(z, c2 + g / 2, TAU - 2 * g - len1, 0);
        spawnOrb(z, c);
        safe = c;
        break;
      }
      case 'spin': {
        // l'ouverture tourne : on la place pour qu'elle soit en c à l'arrivée
        const g = lerp(1.9, 1.35, d);
        const spin = randSign() * lerp(0.45, 0.85, d);
        const c = from + rand(-reach * 0.5, reach * 0.5);
        const arrival = -z / baseV;
        spawnArc(z, c - spin * arrival + g / 2, TAU - g, spin);
        safe = c;
        chain = 0;
        next = 1.15;
        break;
      }
      case 'blocks': {
        const c = from + rand(-reach, reach);
        const n = lastKind === 'laser' ? 3 : Math.round(lerp(3, 6, d));
        placeBlocks(z, c, n, d);
        safe = c;
        break;
      }
      case 'laser': {
        spawnLaser(z, Math.random() * TAU, d > 0.55 ? 3 : 2, randSign() * lerp(0.6, 1.2, d));
        chain = 0;
        next = 1.5; // temps de récupération après un laser
        break;
      }
      default: {
        // spirale d'orbes : pure récompense
        const dir = randSign();
        const n = 8;
        for (let j = 1; j <= n; j++) {
          const f = j / (n + 1);
          spawnOrb(prevZ + (z - prevZ) * f, from + dir * 0.18 * j);
        }
        safe = from + dir * 0.18 * n;
        if (Math.random() < 0.35) spawnPower(z, safe, pickPowerType());
        chain = 0;
      }
    }

    safe = wrap(safe);
    if (chain) orbChain(prevZ, z, from, safe, chain, Math.random() < 0.09 ? 2 : 0);
    lastKind = kind;
    return next;
  }

  /* --- Collisions ------------------------------------------------------------ */
  function arcHit(e) {
    const rel = modTau(theta - e.start);
    return rel <= e.len + PROBE_ANG || rel >= TAU - PROBE_ANG;
  }

  function blockHit(e) {
    return Math.abs(wrap(theta - e.angle)) <= BLOCK_HALF + PROBE_ANG;
  }

  function laserHit(e) {
    for (let k = 0; k < e.count; k++) {
      const a = e.angle + (k * TAU) / e.count;
      if (Math.abs(wrap(theta - a)) <= LASER_HALF + PROBE_ANG) return true;
    }
    return false;
  }

  function pickupHit(e) {
    return Math.abs(wrap(theta - e.angle)) * TRACK <= ORB_REACH;
  }

  function probeX() { return Math.cos(theta) * TRACK; }
  function probeY() { return Math.sin(theta) * TRACK; }

  function collectOrb(e) {
    e.taken = true;
    release(e);
    combo++;
    orbCount++;
    if (combo > maxCombo) maxCombo = combo;
    const prevMult = mult;
    mult = Math.min(8, 1 + Math.floor(combo / 5));
    if (mult > maxMult) maxMult = mult;
    score += 25 * mult;
    particles.burst(e.mesh.position.x, e.mesh.position.y, e.z, 18, colOrb, 7, 0.55, 0.35);
    audio.orb(combo);
    emit('orb', { combo, mult, up: mult > prevMult });
  }

  function missOrb(e) {
    e.missed = true;
    if (combo > 0) {
      const lost = combo;
      combo = 0;
      mult = 1;
      emit('combo-lost', { lost });
    }
  }

  function collectPower(e) {
    release(e);
    score += 100;
    const c = e.type === 'shield' ? colShield : colSlow;
    particles.burst(e.mesh.position.x, e.mesh.position.y, e.z, 40, c, 9, 0.8, 0.45);
    if (e.type === 'shield') shield = 1;
    else slowT = SLOW_TIME;
    audio.power(e.type);
    emit('power', { type: e.type });
  }

  function onHit(e) {
    if (invuln > 0) return;
    const x = probeX();
    const y = probeY();
    if (shield > 0) {
      // le bouclier encaisse et pulvérise l'obstacle
      shield = 0;
      invuln = 1;
      release(e);
      particles.burst(x, y, 0, 70, colShield, 14, 0.9, 0.5);
      particles.burst(x, y, 0, 30, colObs, 10, 0.7, 0.4);
      shake = reducedMotion ? 0 : 0.6;
      audio.shieldBreak();
      emit('shield-break');
      return;
    }
    // impact fatal
    particles.burst(x, y, 0, 140, colObs, 16, 1.2, 0.55);
    particles.burst(x, y, 0, 60, colWhite, 10, 0.9, 0.4);
    shake = reducedMotion ? 0 : 1.4;
    deathT = 0;
    probe.visible = false;
    audio.hit();
    setState('dying');
    emit('hit');
  }

  /* --- Mise à jour des entités ---------------------------------------------- */
  function updateEntities(dt, dz, dtWorld, collide) {
    for (let i = 0; i < all.length; i++) {
      const e = all[i];
      if (!e.active) continue;
      const prevZ = e.z;
      e.z += dz;
      e.mesh.position.z = e.z;

      if (e.kind === 'arc') {
        if (e.spin) {
          e.start = modTau(e.start + e.spin * dtWorld);
          e.mat.uniforms.uStart.value = e.start;
        }
      } else if (e.kind === 'laser') {
        e.angle = modTau(e.angle + e.spin * dtWorld);
        e.mesh.rotation.z = e.angle;
      } else if (e.kind === 'orb') {
        e.core.rotation.x += dt * 2.2;
        e.core.rotation.y += dt * 1.6;
      } else if (e.kind === 'power') {
        e.mesh.rotation.z += dt * 1.5;
        e.shieldMesh.rotation.y += dt * 2;
        e.slowMesh.rotation.x += dt * 2;
      }

      if (e.z - e.hd > RECYCLE_Z) {
        release(e);
        continue;
      }
      if (!collide) continue;

      // Recouvrement en z sur tout le trajet du pas : [prevZ - hd, z + hd] contre [-PROBE, PROBE]
      const overlapZ = prevZ - e.hd <= PROBE && e.z + e.hd >= -PROBE;

      if (e.kind === 'orb') {
        if (e.taken || e.missed) continue;
        if (overlapZ && pickupHit(e)) collectOrb(e);
        else if (e.z - e.hd > PROBE) missOrb(e);
        continue;
      }
      if (e.kind === 'power') {
        if (overlapZ && pickupHit(e)) collectPower(e);
        continue;
      }
      if (!overlapZ || invuln > 0) continue;
      const hit = e.kind === 'arc' ? arcHit(e) : e.kind === 'block' ? blockHit(e) : laserHit(e);
      if (hit) {
        onHit(e);
        if (state !== 'playing') collide = false;
      }
    }
  }

  /* --- Pas de simulation ------------------------------------------------------ */
  function steer(dt) {
    let axis = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (!axis) axis = input.hold;
    if (!axis && input.mouseActive) axis = input.mouse;
    angVel += (axis * TURN - angVel) * (1 - Math.exp(-dt * 18));
    theta = wrap(theta + angVel * dt + input.drag);
    input.drag = 0;
  }

  function stepPlay(dt) {
    runTime += dt;
    baseV = Math.min(VMAX, V0 + ACCEL * runTime);
    if (slowT > 0) slowT = Math.max(0, slowT - dt);
    const ts = slowT > 0 ? SLOW_SCALE : 1;
    timeScale += (ts - timeScale) * (1 - Math.exp(-dt * 5));
    speed = baseV * timeScale;
    const dz = speed * dt;
    travel += dz;
    distance += dz;
    score += dz * 0.5;

    steer(dt);
    if (shield > 0) shield = Math.max(0, shield - dt / SHIELD_TIME);
    if (invuln > 0) invuln -= dt;

    frontZ += dz;
    generate();
    updateEntities(dt, dz, dt * timeScale, true);
    fxStep(dt, dz);

    const t = Math.floor(distance / TIER_DIST);
    if (t !== tier && state === 'playing') {
      tier = t;
      setPalette(tier);
      audio.tier();
      emit('tier', { tier: tier + 1, name: PALETTES[tier % PALETTES.length].name });
    }
  }

  function stepDying(dt) {
    deathT += dt;
    speed *= Math.exp(-dt * 3);
    const dz = speed * dt;
    travel += dz;
    input.drag = 0;
    updateEntities(dt, dz, dt * 0.3, false);
    fxStep(dt, dz);
    if (deathT >= DEATH_TIME) finish();
  }

  function stepAttract(dt) {
    speed += (ATTRACT_V - speed) * (1 - Math.exp(-dt * 1.5));
    const dz = speed * dt;
    travel += dz;
    input.drag = 0;
    const target = -Math.PI / 2 + Math.sin(clock * 0.55) * 0.9;
    const prev = theta;
    theta = wrap(theta + wrap(target - theta) * (1 - Math.exp(-dt * 2)));
    angVel = wrap(theta - prev) / dt;
    if (shield > 0) shield = 0;
    fxStep(dt, dz);
  }

  function fxStep(dt, dz) {
    trail.push(theta, dz);
    particles.update(dt, speed);
    speedLines.update(dt, speed);
  }

  function step(dt) {
    clock += dt;
    if (state === 'playing') stepPlay(dt);
    else if (state === 'dying') stepDying(dt);
    else stepAttract(dt);
  }

  function finish() {
    clearEntities();
    probe.visible = true;
    timeScale = 1;
    slowT = 0;
    shield = 0;
    const stats = {
      score: Math.floor(score),
      distance: Math.floor(distance),
      orbs: orbCount,
      maxCombo,
      maxMult,
      time: runTime,
      tier: tier + 1,
    };
    setState('over');
    if (hooks.onGameOver) hooks.onGameOver(stats);
  }

  /* --- Rendu ------------------------------------------------------------------ */
  let needsRender = true;
  let lastW = 0;
  let lastH = 0;

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h || (w === lastW && h === lastH)) return;
    lastW = w;
    lastH = h;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    updatePointScale();
    needsRender = true;
  }

  function updatePointScale() {
    const hPx = lastH * renderer.getPixelRatio();
    particles.material.uniforms.uScale.value = hPx / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  }

  function visuals(dt) {
    // Palette : fondu doux vers la cible du palier
    const k = 1 - Math.exp(-dt * 1.8);
    colA.lerp(tgtA, k);
    colB.lerp(tgtB, k);
    colObs.lerp(tgtObs, k);
    laserBeamMat.color.copy(colObs).convertSRGBToLinear();
    coreMat.color.copy(colA).convertSRGBToLinear();

    const sf = clamp((speed - V0) / (VMAX - V0), 0, 1);
    const slowAmt = clamp((1 - timeScale) / (1 - SLOW_SCALE), 0, 1);
    const u = tunnelMat.uniforms;
    u.uTravel.value = travel % 120; // 120 = multiple commun des motifs du shader
    u.uTime.value = clock;
    u.uSpeed.value = sf;
    u.uSlow.value = slowAmt;

    // Sonde
    probe.position.set(probeX(), probeY(), 0);
    probeCore.rotation.x += dt * 3;
    probeCore.rotation.y += dt * 2;
    const blink = invuln > 0 ? 0.5 + 0.5 * Math.sin(clock * 40) : 1;
    probeGlow.material.opacity = blink;
    shieldBubble.visible = shield > 0 && (shield > 0.18 || Math.sin(clock * 24) > 0);
    shieldBubble.rotation.y += dt * 1.4;
    shieldBubble.rotation.z += dt * 0.9;

    // Caméra : suit l'angle avec un léger retard, la sonde reste "en bas"
    camAngle = wrap(camAngle + wrap(theta - camAngle) * (1 - Math.exp(-dt * 7)));
    const lag = wrap(theta - camAngle);
    const roll = reducedMotion ? 0 : clamp(lag * 0.3, -0.14, 0.14);
    const ux = Math.cos(camAngle);
    const uy = Math.sin(camAngle);
    const camR = TRACK - 2.4;
    camera.position.set(ux * camR, uy * camR, 6.2);
    if (shake > 0) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
      shake *= Math.exp(-dt * 5);
      if (shake < 0.01) shake = 0;
    }
    const ra = camAngle + roll;
    camera.up.set(-Math.cos(ra), -Math.sin(ra), 0);
    lookTarget.set(ux * 1.5, uy * 1.5, -30);
    camera.lookAt(lookTarget);

    // FOV : s'élargit avec la vitesse, se resserre au ralenti
    const portrait = camera.aspect < 0.85 ? 1.18 : 1; // écran en hauteur : on élargit le champ
    const fovTarget = (reducedMotion ? 70 : 66 + 24 * sf - 8 * slowAmt) * portrait;
    fov += (fovTarget - fov) * (1 - Math.exp(-dt * 3));
    if (Math.abs(camera.fov - fov) > 0.02) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
      updatePointScale();
    }

    // Traînée et lignes de vitesse
    if (slowT > 0) colTrail.copy(colSlow);
    else if (shield > 0) colTrail.copy(colShield).lerp(colWhite, 0.35);
    else colTrail.copy(colProbe);
    trail.mesh.visible = state !== 'dying';
    trail.sync(0.2, colTrail, state === 'playing' ? 1 : 0.6);
    const lineStrength = (reducedMotion ? 0.25 : 1) * (0.15 + sf * 0.85) * (state === 'playing' ? 1 : 0.4);
    speedLines.sync(speed, lineStrength, colB);
    particles.sync();
  }

  function fillHud() {
    hud.score = Math.floor(score);
    hud.combo = combo;
    hud.mult = mult;
    hud.speed = Math.round(speed * 11.5);
    hud.shield = shield;
    hud.slow = slowT / SLOW_TIME;
    hud.tier = tier + 1;
    hud.distance = Math.floor(distance);
  }

  let rafId = 0;
  let running = false;
  let last = 0;
  let acc = 0;

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1; // onglet ralenti, débogueur : delta borné

    if (state === 'paused') {
      if (!needsRender) return; // image figée : rien à redessiner
      dt = 0;
    } else {
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < MAX_STEPS) {
        step(STEP);
        acc -= STEP;
        n++;
      }
      if (n === MAX_STEPS) acc = 0;
    }

    visuals(dt);
    renderer.render(scene, camera);
    needsRender = false;
    fillHud();
    if (hooks.onHud) hooks.onHud(hud);
  }

  function setActive(on) {
    if (on && !running) {
      running = true;
      last = performance.now();
      acc = 0;
      resize();
      rafId = requestAnimationFrame(frame);
    } else if (!on && running) {
      running = false;
      cancelAnimationFrame(rafId);
    }
  }

  /* --- Entrées ----------------------------------------------------------------- */
  let touchId = null;
  let touchStartX = 0;
  let touchLastX = 0;
  let dragging = false;

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || touchId !== null) return;
    touchId = e.pointerId;
    touchStartX = touchLastX = e.clientX;
    dragging = false;
    const r = canvas.getBoundingClientRect();
    input.hold = e.clientX < r.left + r.width / 2 ? -1 : 1; // moitié gauche / droite
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* sans capture : tant pis */ }
  });

  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    if (e.pointerType === 'mouse') {
      // plus la souris s'éloigne du centre, plus la sonde tourne vite
      const off = (e.clientX - (r.left + r.width / 2)) / (r.width * 0.32);
      const mag = Math.abs(off);
      input.mouse = mag < 0.08 ? 0 : Math.sign(off) * Math.min(1, (mag - 0.08) / 0.92);
      input.mouseActive = true;
      return;
    }
    if (e.pointerId !== touchId) return;
    if (!dragging && Math.abs(e.clientX - touchStartX) > 12) {
      dragging = true;
      input.hold = 0;
    }
    if (dragging && state === 'playing') input.drag += ((e.clientX - touchLastX) / r.width) * DRAG_GAIN;
    touchLastX = e.clientX;
  });

  const endTouch = (e) => {
    if (e.pointerId !== touchId) return;
    touchId = null;
    dragging = false;
    input.hold = 0;
  };
  canvas.addEventListener('pointerup', endTouch);
  canvas.addEventListener('pointercancel', endTouch);
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') {
      input.mouseActive = false;
      input.mouse = 0;
    }
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    pause();
  });

  function clearInput() {
    input.left = false;
    input.right = false;
    input.hold = 0;
    input.drag = 0;
    touchId = null;
    dragging = false;
  }

  /* --- API ------------------------------------------------------------------- */
  function start() {
    clearEntities();
    particles.clear();
    clearInput();
    runTime = 0;
    distance = 0;
    score = 0;
    combo = 0;
    maxCombo = 0;
    mult = 1;
    maxMult = 1;
    orbCount = 0;
    shield = 0;
    slowT = 0;
    invuln = 0;
    timeScale = 1;
    angVel = 0;
    tier = 0;
    shake = 0;
    baseV = V0;
    speed = V0;
    setPalette(0);
    probe.visible = true;
    safe = theta;
    frontZ = -40;
    lastKind = '';
    lastMult = 1;
    trail.reset(theta);
    // quelques orbes d'échauffement, droit devant
    for (let i = 0; i < 4; i++) spawnOrb(-16 - i * 6, theta);
    acc = 0;
    last = performance.now();
    audio.start();
    setState('playing');
  }

  function pause() {
    if (state !== 'playing') return false;
    clearInput();
    audio.pause();
    setState('paused');
    return true;
  }

  function resume() {
    if (state !== 'paused') return false;
    clearInput();
    acc = 0;
    last = performance.now();
    setState('playing');
    return true;
  }

  function quit() {
    clearEntities();
    probe.visible = true;
    setPalette(0);
    setState('title');
  }

  function setKey(dir, down) {
    input[dir] = down;
    if (down) input.mouseActive = false;
  }

  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);
  resize();

  return {
    start,
    pause,
    resume,
    quit,
    setKey,
    clearInput,
    setActive,
    resize,
    get state() { return state; },
  };
}
