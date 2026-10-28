// Page Contact : vagues de points en WebGL, formulaire en trois étapes avec
// brouillon local, préparation d'un e-mail (mailto) et petites interactions.
// Aucune requête réseau : rien n'est envoyé depuis cette page.
import * as THREE from 'three';
import { initCommon } from './common.js';

const EMAIL = 'contact@example.com';
const DRAFT_KEY = 'orbitale-contact-draft';
const MSG_MIN = 30;
const MSG_MAX = 1200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const isReduced = () => reducedQuery.matches;

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
// Lissage indépendant du framerate
const damp = (k, dt) => 1 - Math.exp(-k * dt);
// Hex -> vecteur RGB brut (les shaders custom écrivent la couleur telle quelle)
const hexToVec3 = (hex) => new THREE.Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);

// localStorage peut être bloqué (navigation privée, réglages) : tout passe par ici
const store = {
  get(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  },
  set(key, value) {
    try { window.localStorage.setItem(key, value); return true; } catch (e) { return false; }
  },
  remove(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* rien à faire */ }
  },
};

/* ------------------------------------------------------------------------ */
/* GLSL                                                                      */
/* ------------------------------------------------------------------------ */

const WAVE_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uEnergy;
uniform float uPixelRatio;
uniform float uSize;
uniform vec3 uMouse;      // xz du point survolé + intensité du creux
uniform vec4 uRipples[4]; // xz d'origine, temps de départ, amplitude
uniform vec4 uLaunch;     // xz d'origine, temps de départ, amplitude

varying float vHeight;
varying float vGlow;
varying float vFade;

float sq(float x) { return x * x; }

// Onde circulaire qui s'éloigne de son origine et s'amortit
float ripple(vec2 p, vec4 r) {
  float age = uTime - r.z;
  if (r.w <= 0.0 || age < 0.0) return 0.0;
  float d = distance(p, r.xy);
  float front = age * 7.0;
  float env = exp(-sq(d - front) * 0.35) * exp(-age * 0.9);
  return sin((d - front) * 2.2) * env * r.w;
}

void main() {
  vec3 pos = position;
  vec2 p = pos.xz;
  float t = uTime;

  // Houle de base : somme de sinus, amplifiée quand on tape
  float amp = 0.35 + uEnergy * 0.9;
  float h = sin(p.x * 0.28 + t * 0.9) * 0.55
          + sin(p.y * 0.42 - t * 0.7) * 0.45
          + sin((p.x + p.y) * 0.17 + t * 0.5) * 0.6;
  h += sin(p.x * 0.9 + p.y * 0.6 + t * 2.1) * 0.12 * (0.3 + uEnergy * 2.0);
  h *= amp;

  // Creux sous la souris, avec un léger bourrelet autour
  float md = distance(p, uMouse.xy);
  float dent = exp(-md * md * 0.09) * uMouse.z;
  h -= dent * 2.4;
  h += exp(-sq(md - 4.2) * 0.35) * uMouse.z * 0.35;

  // Ondes ponctuelles (frappe clavier, changement d'étape)
  float rip = 0.0;
  for (int i = 0; i < 4; i++) {
    rip += ripple(p, uRipples[i]);
  }
  h += rip;

  // Grande vague de l'envoi
  float launch = 0.0;
  float la = uTime - uLaunch.z;
  if (uLaunch.w > 0.0 && la >= 0.0) {
    float d = distance(p, uLaunch.xy);
    launch = exp(-sq(d - la * 9.0) * 0.12) * exp(-la * 0.45) * uLaunch.w;
    h += launch * 2.6;
  }

  pos.y += h;
  vHeight = h;
  vGlow = clamp(dent + abs(rip) * 0.8 + launch, 0.0, 1.0);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  float depth = max(-mv.z, 0.001);
  // Fondu au loin et tout près de la caméra
  vFade = (1.0 - smoothstep(14.0, 44.0, depth)) * smoothstep(0.5, 4.0, depth);
  gl_PointSize = uSize * uPixelRatio * (1.0 + vGlow * 1.2) * (10.0 / depth);
}
`;

const WAVE_POINTS_FRAGMENT = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform float uOpacity;

varying float vHeight;
varying float vGlow;
varying float vFade;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = 1.0 - smoothstep(0.1, 0.5, d);

  float k = clamp(vHeight * 0.45 + 0.5, 0.0, 1.0);
  vec3 col = mix(uColorA, uColorB, k);
  col = mix(col, uColorC, vGlow * 0.85);

  gl_FragColor = vec4(col, a * vFade * uOpacity * (0.55 + vGlow * 0.6));
}
`;

const WAVE_WIRE_FRAGMENT = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform float uOpacity;

varying float vHeight;
varying float vGlow;
varying float vFade;

void main() {
  float k = clamp(vHeight * 0.45 + 0.5, 0.0, 1.0);
  vec3 col = mix(uColorA, uColorB, k);
  col = mix(col, uColorC, vGlow);
  gl_FragColor = vec4(col, vFade * uOpacity * (0.07 + vGlow * 0.3));
}
`;

const CONFETTI_VERTEX = /* glsl */ `
attribute vec3 aVel;
attribute vec3 aColor;
attribute float aSeed;

uniform float uAge;
uniform vec3 uOrigin;
uniform float uPixelRatio;

varying vec3 vColor;
varying float vAlpha;
varying float vAngle;

void main() {
  float t = uAge;
  // Balistique simple + flottement latéral façon papier
  vec3 p = uOrigin + aVel * t + vec3(0.0, -3.2, 0.0) * t * t;
  p.x += sin(t * (3.0 + aSeed * 4.0) + aSeed * 6.2831) * 0.25 * t;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (60.0 + aSeed * 50.0) * uPixelRatio / max(-mv.z, 0.5);

  vColor = aColor;
  vAlpha = 1.0 - smoothstep(2.4, 3.6, t);
  vAngle = aSeed * 6.2831 + t * (4.0 + aSeed * 6.0);
}
`;

const CONFETTI_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vAngle;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float s = sin(vAngle);
  float co = cos(vAngle);
  c = mat2(co, -s, s, co) * c;
  // Rectangle dont la largeur oscille : illusion de rotation 3D
  float w = 0.08 + 0.3 * abs(sin(vAngle * 0.7));
  if (abs(c.x) > w || abs(c.y) > 0.42) discard;
  gl_FragColor = vec4(vColor, vAlpha);
}
`;

/* ------------------------------------------------------------------------ */
/* Scène : plan de vagues                                                    */
/* ------------------------------------------------------------------------ */
function initWaves(canvas) {
  const api = { pulse() {}, ripple() {}, launch() {}, setScroll() {} };
  if (!canvas) return api;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  } catch (err) {
    // WebGL indisponible : le halo CSS du body prend le relais
    canvas.remove();
    return api;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  const lookTarget = new THREE.Vector3(0, 0, -8);

  const small = window.innerWidth < 700;
  const geometry = new THREE.PlaneGeometry(64, 44, small ? 110 : 180, small ? 80 : 120);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, -16);

  const ripples = [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, -100, 0));
  const uniforms = {
    uTime: { value: 0 },
    uEnergy: { value: 0 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uSize: { value: small ? 2.6 : 2.2 },
    uMouse: { value: new THREE.Vector3(0, -6, 0) },
    uRipples: { value: ripples },
    uLaunch: { value: new THREE.Vector4(0, -6, -100, 0) },
    uColorA: { value: hexToVec3(0x7c5cff) },
    uColorB: { value: hexToVec3(0x00e5ff) },
    uColorC: { value: hexToVec3(0xff3d81) },
    uOpacity: { value: 1 },
  };

  const pointsMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: WAVE_VERTEX,
    fragmentShader: WAVE_POINTS_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, pointsMat);
  points.frustumCulled = false;
  scene.add(points);

  // Fil de fer très discret (desktop seulement)
  let wireMat = null;
  if (!small) {
    wireMat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: WAVE_VERTEX,
      fragmentShader: WAVE_WIRE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      wireframe: true,
      blending: THREE.AdditiveBlending,
    });
    const wire = new THREE.Mesh(geometry, wireMat);
    wire.frustumCulled = false;
    scene.add(wire);
  }

  /* --- Confettis 3D --- */
  const CONFETTI = small ? 160 : 320;
  const cGeo = new THREE.BufferGeometry();
  const cPos = new Float32Array(CONFETTI * 3);
  const cVel = new Float32Array(CONFETTI * 3);
  const cCol = new Float32Array(CONFETTI * 3);
  const cSeed = new Float32Array(CONFETTI);
  const palette = [0x7c5cff, 0x00e5ff, 0xff3d81, 0xffffff].map(hexToVec3);
  for (let i = 0; i < CONFETTI; i++) {
    const a = Math.random() * Math.PI * 2;
    const spread = Math.random() * 3.4;
    cVel[i * 3] = Math.cos(a) * spread;
    cVel[i * 3 + 1] = 3 + Math.random() * 5;
    cVel[i * 3 + 2] = Math.sin(a) * spread * 0.7;
    const col = palette[i % palette.length];
    cCol[i * 3] = col.x;
    cCol[i * 3 + 1] = col.y;
    cCol[i * 3 + 2] = col.z;
    cSeed[i] = Math.random();
  }
  cGeo.setAttribute('position', new THREE.BufferAttribute(cPos, 3));
  cGeo.setAttribute('aVel', new THREE.BufferAttribute(cVel, 3));
  cGeo.setAttribute('aColor', new THREE.BufferAttribute(cCol, 3));
  cGeo.setAttribute('aSeed', new THREE.BufferAttribute(cSeed, 1));
  const cUniforms = {
    uAge: { value: 99 },
    uOrigin: { value: new THREE.Vector3() },
    uPixelRatio: uniforms.uPixelRatio,
  };
  const cMat = new THREE.ShaderMaterial({
    uniforms: cUniforms,
    vertexShader: CONFETTI_VERTEX,
    fragmentShader: CONFETTI_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
  const confetti = new THREE.Points(cGeo, cMat);
  confetti.frustumCulled = false;
  confetti.visible = false;
  scene.add(confetti);

  /* --- Pointeur projeté sur le plan y = 0 --- */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  const mouseTarget = new THREE.Vector2(0, -6);
  let pointerActive = false;
  let lastPointer = 0;

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    pointerActive = true;
    lastPointer = performance.now();
  }, { passive: true });
  document.addEventListener('mouseleave', () => { pointerActive = false; });

  /* --- État --- */
  let time = 0;
  let energy = 0;
  let scroll = 0;
  let scrollSmooth = 0;
  let rippleSlot = 0;
  let confettiAge = 99;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Plus de recul en portrait pour garder la houle lisible
    camera.fov = w / h < 0.8 ? 70 : 55;
    camera.updateProjectionMatrix();
  }

  function tick(dt) {
    const speed = isReduced() ? 0.15 : 1;
    time += dt * speed;
    uniforms.uTime.value = time;

    // Énergie : monte quand on tape, retombe doucement
    energy *= Math.exp(-0.7 * dt);
    uniforms.uEnergy.value += (energy - uniforms.uEnergy.value) * damp(4, dt);

    // Caméra : suit le scroll et dérive lentement
    scrollSmooth += (scroll - scrollSmooth) * damp(3, dt);
    camera.position.set(Math.sin(time * 0.05) * 1.4, 4.2 + scrollSmooth * 2.2, 9 - scrollSmooth * 2);
    lookTarget.set(0, 0, -8 - scrollSmooth * 4);
    camera.lookAt(lookTarget);

    // Creux : souris réelle, sinon trajectoire autonome
    const idle = !pointerActive || performance.now() - lastPointer > 4000;
    let strength = 1;
    if (idle) {
      mouseTarget.set(Math.sin(time * 0.21) * 9, -8 + Math.cos(time * 0.17) * 4);
      strength = 0.55;
    } else {
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(floor, hit)) mouseTarget.set(hit.x, hit.z);
    }
    const m = uniforms.uMouse.value;
    const k = damp(idle ? 1.5 : 6, dt);
    m.x += (mouseTarget.x - m.x) * k;
    m.y += (mouseTarget.y - m.y) * k;
    m.z += (strength - m.z) * damp(2, dt);

    // Confettis
    if (confetti.visible) {
      confettiAge += dt;
      cUniforms.uAge.value = confettiAge;
      if (confettiAge > 4) confetti.visible = false;
    }

    renderer.render(scene, camera);
  }

  /* --- Boucle démarrable / arrêtable --- */
  let raf = 0;
  let running = false;
  let last = 0;
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    tick(dt);
  };
  const start = () => {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };

  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  if (!document.hidden) start();

  // Libère le GPU quand on quitte la page (hors cache "retour arrière")
  window.addEventListener('pagehide', (e) => {
    if (e.persisted) return;
    stop();
    geometry.dispose();
    cGeo.dispose();
    pointsMat.dispose();
    cMat.dispose();
    if (wireMat) wireMat.dispose();
    renderer.dispose();
  });

  api.pulse = (amount = 0.05) => {
    energy = clamp(energy + amount, 0, 1);
  };

  api.ripple = (amp = 0.6, x, z) => {
    if (isReduced()) return;
    const r = ripples[rippleSlot];
    rippleSlot = (rippleSlot + 1) % ripples.length;
    r.set(
      x ?? (Math.random() - 0.5) * 22,
      z ?? -4 - Math.random() * 12,
      time,
      amp
    );
  };

  api.launch = () => {
    energy = 1;
    if (isReduced()) return;
    uniforms.uLaunch.value.set(0, -6, time, 1);
    // Confettis tirés juste devant la caméra
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    cUniforms.uOrigin.value.copy(camera.position).addScaledVector(dir, 8).add(new THREE.Vector3(0, -2.5, 0));
    confettiAge = 0;
    cUniforms.uAge.value = 0;
    confetti.visible = true;
  };

  api.setScroll = (p) => {
    scroll = clamp(p, 0, 1);
  };

  return api;
}

/* ------------------------------------------------------------------------ */
/* Copie dans le presse-papiers (avec repli)                                 */
/* ------------------------------------------------------------------------ */
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    // on tente le repli ci-dessous
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (err) {
    return false;
  }
}

/* ------------------------------------------------------------------------ */
/* Formulaire multi-étapes                                                   */
/* ------------------------------------------------------------------------ */
const STEP_FIELDS = {
  1: ['type', 'budget', 'delay'],
  2: ['name', 'email', 'company', 'message'],
  3: ['consent'],
};
const FIELD_STEP = { type: 1, budget: 1, delay: 1, name: 2, email: 2, company: 2, message: 2, consent: 3 };
const STEP_NAMES = { 1: 'Le projet', 2: 'Vous', 3: 'Vérification' };
const FIELD_LABELS = {
  type: 'type de projet',
  budget: 'budget',
  delay: 'délai',
  name: 'nom',
  email: 'e-mail',
  company: 'entreprise',
  message: 'message',
  consent: 'case de confirmation',
};
const SAVED_FIELDS = ['type', 'budget', 'delay', 'name', 'email', 'company', 'message'];

const VALIDATORS = {
  type: (v) => (v ? '' : 'Choisissez le type de projet qui se rapproche le plus du vôtre.'),
  budget: (v) => (v ? '' : 'Indiquez une fourchette de budget. « Je ne sais pas encore » est une réponse valable.'),
  delay: (v) => (v ? '' : 'Précisez le délai souhaité, même approximatif.'),
  name: (v) => {
    if (!v) return 'Indiquez votre nom pour que l\'on sache à qui répondre.';
    if (v.length < 2) return 'Votre nom doit contenir au moins 2 caractères.';
    return '';
  },
  email: (v) => {
    if (!v) return 'Indiquez votre adresse e-mail pour recevoir notre réponse.';
    if (!EMAIL_RE.test(v)) return 'Cette adresse semble incomplète. Format attendu : prenom@domaine.fr';
    return '';
  },
  company: (v) => (v.length > 80 ? 'Le nom de la structure ne doit pas dépasser 80 caractères.' : ''),
  message: (v) => {
    if (!v) return 'Décrivez votre projet en quelques phrases.';
    if (v.length < MSG_MIN) {
      const n = MSG_MIN - v.length;
      return `Encore ${n} caractère${n > 1 ? 's' : ''} au minimum : quelques mots de plus nous aideront.`;
    }
    if (v.length > MSG_MAX) return `Le message ne doit pas dépasser ${MSG_MAX} caractères.`;
    return '';
  },
  consent: (v) => (v ? '' : 'Cochez cette case pour préparer l\'e-mail.'),
};

function initForm(waves) {
  const form = document.getElementById('ct-form');
  if (!form) return;

  const gsap = window.gsap;
  const card = form.closest('.ct-form-card');
  const panels = Array.from(form.querySelectorAll('.ct-panel'));
  const stepBtns = Array.from(form.querySelectorAll('[data-goto]'));
  const barFill = document.getElementById('ct-bar-fill');
  const stepStatus = document.getElementById('ct-step-status');
  const backBtn = document.getElementById('ct-back');
  const nextLabel = document.getElementById('ct-next-label');
  const formLive = document.getElementById('ct-form-live');
  const draftStatus = document.getElementById('ct-draft-status');
  const draftClear = document.getElementById('ct-draft-clear');
  const countEl = document.getElementById('ct-count');
  const counter = document.getElementById('ct-counter');
  const counterLive = document.getElementById('ct-counter-live');
  const subjectPreview = document.getElementById('ct-subject-preview');
  const success = document.getElementById('ct-success');
  const successTitle = document.getElementById('ct-success-title');
  const successLive = document.getElementById('ct-success-live');
  const mailto = document.getElementById('ct-mailto');

  let step = 1;
  const touched = new Set();

  /* --- Lecture / écriture des champs --- */
  const controls = (name) => Array.from(form.querySelectorAll(`[name="${name}"]`));

  const getValue = (name) => {
    const els = controls(name);
    if (!els.length) return '';
    const first = els[0];
    if (first.type === 'radio') {
      const checked = els.find((el) => el.checked);
      return checked ? checked.value : '';
    }
    if (first.type === 'checkbox') return first.checked;
    return first.value.trim();
  };

  const setValue = (name, value) => {
    const els = controls(name);
    if (!els.length || typeof value !== 'string') return;
    if (els[0].type === 'radio') {
      els.forEach((el) => { el.checked = el.value === value; });
    } else {
      els[0].value = value.slice(0, Number(els[0].maxLength) > 0 ? els[0].maxLength : value.length);
    }
  };

  const data = () => {
    const out = {};
    SAVED_FIELDS.forEach((name) => { out[name] = getValue(name); });
    return out;
  };

  /* --- Erreurs accessibles --- */
  function showError(name, message) {
    const errEl = form.querySelector(`[data-error-for="${name}"]`);
    if (errEl) errEl.textContent = message;
    const els = controls(name);
    const invalid = Boolean(message);
    els.forEach((el) => {
      el.setAttribute('aria-invalid', String(invalid));
      if (el.type === 'radio' && errEl) {
        // Chaque radio porte le message, lu par tous les lecteurs d'écran
        if (invalid) el.setAttribute('aria-describedby', errEl.id);
        else el.removeAttribute('aria-describedby');
      }
      if (el.classList.contains('ct-input')) {
        const ok = !invalid && touched.has(name) && el.value.trim() !== '';
        if (ok) el.dataset.valid = 'true';
        else delete el.dataset.valid;
      }
    });
    const group = els[0] && els[0].closest('.ct-group');
    if (group) group.classList.toggle('is-invalid', invalid);
  }

  const validateField = (name) => {
    const msg = VALIDATORS[name] ? VALIDATORS[name](getValue(name)) : '';
    showError(name, msg);
    return msg;
  };

  const isStepValid = (n) => STEP_FIELDS[n].every((name) => !VALIDATORS[name](getValue(name)));

  const focusField = (name) => {
    const els = controls(name);
    if (!els.length) return;
    const target = els.find((el) => el.checked) || els[0];
    target.focus({ preventScroll: false });
  };

  function validateStep(n, { focus = true } = {}) {
    const invalid = [];
    STEP_FIELDS[n].forEach((name) => {
      touched.add(name);
      if (validateField(name)) invalid.push(name);
    });
    if (invalid.length) {
      const list = invalid.map((name) => FIELD_LABELS[name]).join(', ');
      announce(`${invalid.length} champ${invalid.length > 1 ? 's' : ''} à corriger : ${list}.`);
      if (focus) focusField(invalid[0]);
      return false;
    }
    return true;
  }

  function announce(text) {
    // Vidé puis rempli pour que le même message soit relu
    formLive.textContent = '';
    window.setTimeout(() => { formLive.textContent = text; }, 60);
  }

  /* --- Navigation entre étapes --- */
  function showStep(n, { silent = false, focusName = null } = {}) {
    const prev = step;
    step = n;
    panels.forEach((panel) => {
      panel.hidden = Number(panel.dataset.step) !== n;
    });
    stepBtns.forEach((btn) => {
      const s = Number(btn.dataset.goto);
      if (s === n) btn.setAttribute('aria-current', 'step');
      else btn.removeAttribute('aria-current');
      btn.classList.toggle('is-done', s < n);
    });
    barFill.style.transform = `scaleX(${n / 3})`;
    stepStatus.textContent = `Étape ${n} sur 3 — ${STEP_NAMES[n]}`;
    backBtn.hidden = n === 1;
    nextLabel.textContent = n < 3 ? 'Continuer' : 'Préparer mon e-mail';
    if (n === 3) fillRecap();

    const panel = panels[n - 1];
    if (!silent && gsap && !isReduced() && prev !== n) {
      const dir = n > prev ? 1 : -1;
      gsap.fromTo(panel, { opacity: 0, x: 24 * dir }, { opacity: 1, x: 0, duration: 0.55, ease: 'power3.out', clearProps: 'all' });
    }

    if (!silent) {
      // Ramène le haut du formulaire à l'écran si besoin
      const top = card.getBoundingClientRect().top;
      if (top < 0) card.scrollIntoView({ behavior: isReduced() ? 'auto' : 'smooth', block: 'start' });
      if (focusName) focusField(focusName);
      else panel.querySelector('.ct-panel-title').focus({ preventScroll: true });
      waves.ripple(1, 0, -6);
      waves.pulse(0.2);
      saveDraftSoon();
    }
  }

  // Avancer exige que les étapes précédentes soient valides
  function goTo(n, opts = {}) {
    n = clamp(n, 1, 3);
    if (n > step) {
      for (let s = step; s < n; s++) {
        if (!isStepValid(s)) {
          if (s !== step) showStep(s, { silent: false });
          validateStep(s);
          return;
        }
      }
    }
    showStep(n, opts);
  }

  stepBtns.forEach((btn) => btn.addEventListener('click', () => goTo(Number(btn.dataset.goto))));
  backBtn.addEventListener('click', () => goTo(step - 1));

  /* --- Récapitulatif --- */
  const buildSubject = (d) => `[ORBITALE] ${d.type || 'Projet'} — ${d.name || 'Sans nom'}${d.company ? ` (${d.company})` : ''}`;

  function fillRecap() {
    const d = data();
    form.querySelectorAll('[data-recap]').forEach((dd) => {
      const v = d[dd.dataset.recap];
      dd.textContent = v || (dd.dataset.recap === 'company' ? 'Non renseignée' : '—');
      dd.classList.toggle('is-empty', !v);
    });
    subjectPreview.textContent = buildSubject(d);
  }

  form.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.edit;
      showStep(FIELD_STEP[name], { focusName: name });
    });
  });

  /* --- Compteur de caractères --- */
  const message = form.elements.namedItem('message');
  let counterBand = -1;
  function updateCounter(announceIt) {
    const n = message.value.length;
    countEl.textContent = String(n);
    counter.classList.toggle('is-warn', n >= MSG_MAX - 200 && n < MSG_MAX);
    counter.classList.toggle('is-full', n >= MSG_MAX);
    // Annonce vocale uniquement aux paliers, pas à chaque frappe
    const band = n >= MSG_MAX ? 3 : n >= MSG_MAX - 200 ? 2 : n >= MSG_MIN ? 1 : 0;
    if (announceIt && band !== counterBand && band > 0) {
      counterLive.textContent = band === 1
        ? 'Longueur minimale atteinte.'
        : band === 2
          ? `Il reste ${MSG_MAX - n} caractères.`
          : `Limite de ${MSG_MAX} caractères atteinte.`;
    }
    counterBand = band;
  }

  /* --- Validation en direct --- */
  let lastRipple = 0;
  form.addEventListener('input', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLElement) || !el.name) return;
    if (el.name === 'message') updateCounter(true);
    if (touched.has(el.name)) validateField(el.name);
    // La houle réagit à la saisie
    waves.pulse(0.05);
    const now = performance.now();
    if (now - lastRipple > 380) {
      lastRipple = now;
      waves.ripple(0.45);
    }
    saveDraftSoon();
  });

  form.addEventListener('change', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement) || !el.name) return;
    if (el.type === 'radio' || el.type === 'checkbox') {
      touched.add(el.name);
      validateField(el.name);
      waves.ripple(0.9);
      waves.pulse(0.12);
    }
    saveDraftSoon();
  });

  // Validation à la sortie du champ (pas pendant la première saisie)
  form.addEventListener('focusout', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLElement) || !el.classList.contains('ct-input')) return;
    if (el.value.trim() === '' && !touched.has(el.name)) return;
    touched.add(el.name);
    validateField(el.name);
  });

  // Ctrl / Cmd + Entrée dans le message : étape suivante
  message.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      form.requestSubmit ? form.requestSubmit() : goTo(step + 1);
    }
  });

  /* --- Envoi : préparation de l'e-mail --- */
  let lastMail = { subject: '', body: '' };

  function buildMail(d) {
    const lines = [
      'Bonjour ORBITALE,',
      '',
      d.message,
      '',
      '—',
      `Type de projet : ${d.type}`,
      `Budget : ${d.budget}`,
      `Délai : ${d.delay}`,
      `Nom : ${d.name}`,
    ];
    if (d.company) lines.push(`Entreprise : ${d.company}`);
    lines.push(`E-mail de réponse : ${d.email}`, '', 'Message préparé depuis le formulaire de contact du site ORBITALE.');
    return { subject: buildSubject(d), body: lines.join('\r\n') };
  }

  function finalize() {
    const d = data();
    lastMail = buildMail(d);
    mailto.href = `mailto:${EMAIL}?subject=${encodeURIComponent(lastMail.subject)}&body=${encodeURIComponent(lastMail.body)}`;

    form.hidden = true;
    success.hidden = false;
    // Relance la séquence CSS de décollage
    success.classList.remove('is-launching');
    void success.offsetWidth;
    success.classList.add('is-launching');

    if (gsap && !isReduced()) {
      // Opacité seule (pas autoAlpha) : le titre doit rester focalisable
      gsap.from(success.querySelectorAll('.ct-success-title, .ct-success-text, .ct-success-actions, .ct-success-links'), {
        opacity: 0, y: 24, duration: 0.8, stagger: 0.08, delay: 0.5, ease: 'power3.out', clearProps: 'all',
      });
    }
    const top = card.getBoundingClientRect().top;
    if (top < 0) card.scrollIntoView({ behavior: isReduced() ? 'auto' : 'smooth', block: 'start' });
    successTitle.focus({ preventScroll: true });
    successLive.textContent = 'Votre e-mail est prêt. Il n\'a pas encore été envoyé : utilisez le bouton « Ouvrir dans ma messagerie ».';
    waves.launch();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (step < 3) {
      goTo(step + 1);
      return;
    }
    // Dernière vérification de toutes les étapes
    for (let s = 1; s <= 3; s++) {
      if (!isStepValid(s)) {
        if (s !== step) showStep(s);
        validateStep(s);
        return;
      }
    }
    finalize();
  });

  document.getElementById('ct-copy-message').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const ok = await copyText(`Objet : ${lastMail.subject}\n\n${lastMail.body.replace(/\r\n/g, '\n')}\n\nÀ envoyer à : ${EMAIL}`);
    btn.textContent = ok ? 'Message copié ✓' : 'Copie impossible';
    successLive.textContent = ok ? 'Le message a été copié dans le presse-papiers.' : 'La copie a échoué. Sélectionnez le texte manuellement.';
    window.setTimeout(() => { btn.textContent = 'Copier le message'; }, 2200);
  });

  document.getElementById('ct-edit-again').addEventListener('click', () => {
    success.hidden = true;
    form.hidden = false;
    showStep(3);
  });

  document.getElementById('ct-restart').addEventListener('click', () => {
    clearDraft();
    success.hidden = true;
    form.hidden = false;
    showStep(1);
  });

  /* --- Brouillon (localStorage) --- */
  let saveTimer = 0;
  let restoring = false;

  const timeLabel = (date) => date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', ' h ');

  function saveDraft() {
    if (restoring) return;
    const d = data();
    const hasContent = SAVED_FIELDS.some((name) => d[name]);
    if (!hasContent) {
      store.remove(DRAFT_KEY);
      return;
    }
    const ok = store.set(DRAFT_KEY, JSON.stringify({ v: 1, step, savedAt: Date.now(), ...d }));
    draftStatus.textContent = ok
      ? `Brouillon enregistré sur cet appareil à ${timeLabel(new Date())}.`
      : 'Stockage local indisponible : le brouillon ne sera pas conservé.';
  }

  function saveDraftSoon() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveDraft, 500);
  }

  function resetUI() {
    form.reset();
    touched.clear();
    Object.keys(VALIDATORS).forEach((name) => {
      showError(name, '');
      controls(name).forEach((el) => el.removeAttribute('aria-invalid'));
    });
    updateCounter(false);
  }

  function clearDraft() {
    window.clearTimeout(saveTimer);
    store.remove(DRAFT_KEY);
    restoring = true;
    resetUI();
    restoring = false;
    draftStatus.textContent = 'Brouillon effacé. Le formulaire est vide.';
  }

  // Effacement en deux temps pour éviter les accidents
  let confirmTimer = 0;
  draftClear.addEventListener('click', () => {
    if (draftClear.dataset.confirm !== 'true') {
      draftClear.dataset.confirm = 'true';
      draftClear.textContent = 'Confirmer l\'effacement';
      confirmTimer = window.setTimeout(() => {
        draftClear.dataset.confirm = '';
        draftClear.textContent = 'Effacer le brouillon';
      }, 3500);
      return;
    }
    window.clearTimeout(confirmTimer);
    draftClear.dataset.confirm = '';
    draftClear.textContent = 'Effacer le brouillon';
    clearDraft();
    showStep(1, { silent: true });
    panels[0].querySelector('.ct-panel-title').focus({ preventScroll: true });
  });

  function restoreDraft() {
    const raw = store.get(DRAFT_KEY);
    if (!raw) return;
    let saved;
    try {
      saved = JSON.parse(raw);
    } catch (err) {
      store.remove(DRAFT_KEY);
      return;
    }
    if (!saved || typeof saved !== 'object') return;
    restoring = true;
    SAVED_FIELDS.forEach((name) => setValue(name, saved[name]));
    restoring = false;
    updateCounter(false);

    // Reprend à l'étape enregistrée si les précédentes sont complètes
    let target = clamp(Number(saved.step) || 1, 1, 3);
    for (let s = 1; s < target; s++) {
      if (!isStepValid(s)) { target = s; break; }
    }
    if (target !== 1) showStep(target, { silent: true });
    const when = saved.savedAt ? new Date(saved.savedAt) : null;
    draftStatus.textContent = when && !Number.isNaN(when.getTime())
      ? `Brouillon du ${when.toLocaleDateString('fr-FR')} à ${timeLabel(when)} restauré.`
      : 'Brouillon restauré.';
  }

  updateCounter(false);
  restoreDraft();
}

/* ------------------------------------------------------------------------ */
/* Bouton "Copier l'e-mail"                                                  */
/* ------------------------------------------------------------------------ */
function initCopyEmail() {
  const btn = document.getElementById('ct-copy-email');
  if (!btn) return;
  const label = btn.querySelector('.ct-copy-label');
  const live = document.getElementById('ct-copy-live');
  let timer = 0;
  btn.addEventListener('click', async () => {
    const ok = await copyText(btn.dataset.copy || EMAIL);
    window.clearTimeout(timer);
    btn.classList.toggle('is-copied', ok);
    btn.classList.toggle('is-failed', !ok);
    label.textContent = ok ? 'Adresse copiée ✓' : 'Copie impossible';
    live.textContent = ok
      ? 'Adresse e-mail copiée dans le presse-papiers.'
      : 'La copie a échoué : sélectionnez l\'adresse contact@example.com manuellement.';
    timer = window.setTimeout(() => {
      btn.classList.remove('is-copied', 'is-failed');
      label.textContent = 'Copier l\'e-mail';
    }, 2200);
  });
}

/* ------------------------------------------------------------------------ */
/* FAQ : ouverture animée des <details>                                      */
/* ------------------------------------------------------------------------ */
function initFaq() {
  const gsap = window.gsap;
  if (!gsap) return;
  document.querySelectorAll('.ct-faq-item').forEach((item) => {
    const summary = item.querySelector('summary');
    const body = item.querySelector('.ct-faq-body');
    summary.addEventListener('click', (e) => {
      if (isReduced()) return;
      e.preventDefault();
      if (item.open) {
        gsap.to(body, {
          height: 0, opacity: 0, duration: 0.45, ease: 'power3.inOut', overwrite: true,
          onComplete: () => { item.open = false; gsap.set(body, { clearProps: 'all' }); },
        });
      } else {
        item.open = true;
        gsap.fromTo(body, { height: 0, opacity: 0 }, {
          height: 'auto', opacity: 1, duration: 0.55, ease: 'power3.out', overwrite: true, clearProps: 'all',
        });
      }
    });
  });
}

/* ------------------------------------------------------------------------ */
/* Animations d'entrée (si GSAP est là)                                      */
/* ------------------------------------------------------------------------ */
function initAnims(waves) {
  const gsap = window.gsap;
  const ST = window.ScrollTrigger;

  // Le scroll pilote la caméra, avec ou sans GSAP
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    waves.setScroll(max > 0 ? window.scrollY / max : 0);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (!gsap || isReduced()) return;

  gsap.from('.ct-hero .ct-word', { yPercent: 115, duration: 1.2, stagger: 0.08, ease: 'power4.out', delay: 0.35 });
  gsap.from('.ct-kicker, .ct-hero-sub, .ct-hero-actions, .ct-hero-facts', {
    autoAlpha: 0, y: 24, duration: 1, stagger: 0.1, ease: 'power3.out', delay: 0.6,
  });

  if (!ST) return;
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

  // Compteur du temps de réponse
  const num = document.querySelector('.ct-stat-num[data-count]');
  if (num) {
    const target = Number(num.dataset.count) || 0;
    const obj = { v: 0 };
    gsap.to(obj, {
      v: target,
      duration: 1.6,
      ease: 'power2.out',
      scrollTrigger: { trigger: num, start: 'top 90%', once: true },
      onUpdate: () => { num.textContent = String(Math.round(obj.v)); },
    });
  }
}

/* ------------------------------------------------------------------------ */
/* Démarrage                                                                 */
/* ------------------------------------------------------------------------ */
function start() {
  initCommon();
  const waves = initWaves(document.getElementById('contact-canvas'));
  initForm(waves);
  initCopyEmail();
  initFaq();
  initAnims(waves);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
