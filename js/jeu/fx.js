// ORBITE — effets visuels réutilisables : particules, traînée, lignes de vitesse.
// Tout est alloué une seule fois : les mises à jour réécrivent les mêmes tampons.
import * as THREE from 'three';

// Couleur "brute" pour les ShaderMaterial : pas de conversion d'espace colorimétrique,
// la valeur hexadécimale arrive telle quelle à l'écran.
export function rawColor(hex, target = new THREE.Color()) {
  return target.setHex(hex, THREE.LinearSRGBColorSpace);
}

// Halo radial blanc (teinté ensuite par la couleur du matériau)
export function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,255,255,0.65)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.16)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Dégradé vertical pour les faisceaux laser
export function makeBeamTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  grd.addColorStop(0.5, 'rgba(255,255,255,1)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ------------------------------------------------------------------------ */
/* Particules : un seul THREE.Points, tampon circulaire                      */
/* ------------------------------------------------------------------------ */
const PARTICLE_VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(-mv.z, 0.5);
  gl_Position = projectionMatrix * mv;
}`;

const PARTICLE_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  float a = (1.0 - smoothstep(0.0, 0.5, d)) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor * a, a);
}`;

export class Particles {
  constructor(count = 640) {
    this.count = count;
    this.cursor = 0;
    this.awake = false;
    this.dirty = false;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.size = new Float32Array(count);
    this.alpha = new Float32Array(count);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.base = new Float32Array(count);

    const geo = new THREE.BufferGeometry();
    this.attrs = [
      new THREE.BufferAttribute(this.pos, 3),
      new THREE.BufferAttribute(this.col, 3),
      new THREE.BufferAttribute(this.size, 1),
      new THREE.BufferAttribute(this.alpha, 1),
    ];
    this.attrs.forEach((a) => a.setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('position', this.attrs[0]);
    geo.setAttribute('aColor', this.attrs[1]);
    geo.setAttribute('aSize', this.attrs[2]);
    geo.setAttribute('aAlpha', this.attrs[3]);

    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 300 } },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
  }

  // Gerbe sphérique ; color = THREE.Color brute
  burst(x, y, z, n, color, speed, life, size) {
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (i + 1) % this.count;
      const i3 = i * 3;
      const u = Math.random() * 2 - 1;
      const phi = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const sp = speed * (0.35 + Math.random() * 0.65);
      this.pos[i3] = x;
      this.pos[i3 + 1] = y;
      this.pos[i3 + 2] = z;
      this.vel[i3] = s * Math.cos(phi) * sp;
      this.vel[i3 + 1] = s * Math.sin(phi) * sp;
      this.vel[i3 + 2] = u * sp;
      this.col[i3] = color.r;
      this.col[i3 + 1] = color.g;
      this.col[i3 + 2] = color.b;
      const l = life * (0.6 + Math.random() * 0.4);
      this.life[i] = l;
      this.maxLife[i] = l;
      this.base[i] = size * (0.5 + Math.random() * 0.8);
      this.size[i] = this.base[i];
      this.alpha[i] = 1;
    }
    this.awake = true;
    this.dirty = true;
  }

  // drift : vitesse du monde, les éclats repartent avec le décor
  update(dt, drift) {
    if (!this.awake) return;
    const drag = Math.exp(-dt * 2.2);
    let alive = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      const l = this.life[i] - dt;
      this.life[i] = l;
      if (l <= 0) {
        this.alpha[i] = 0;
        this.size[i] = 0;
        continue;
      }
      alive++;
      const i3 = i * 3;
      this.vel[i3] *= drag;
      this.vel[i3 + 1] *= drag;
      this.vel[i3 + 2] *= drag;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += (this.vel[i3 + 2] + drift) * dt;
      const t = l / this.maxLife[i];
      this.alpha[i] = t;
      this.size[i] = this.base[i] * (0.35 + 0.65 * t);
    }
    this.awake = alive > 0;
    this.dirty = true;
  }

  sync() {
    if (!this.dirty) return;
    for (let i = 0; i < this.attrs.length; i++) this.attrs[i].needsUpdate = true;
    this.dirty = false;
  }

  clear() {
    this.life.fill(0);
    this.alpha.fill(0);
    this.size.fill(0);
    this.awake = false;
    this.dirty = true;
  }
}

/* ------------------------------------------------------------------------ */
/* Traînée : ruban plaqué contre la paroi, échantillonné à chaque pas        */
/* ------------------------------------------------------------------------ */
export class Trail {
  constructor(n, radius) {
    this.n = n;
    this.radius = radius;
    this.ang = new Float32Array(n);
    this.z = new Float32Array(n);
    this.pos = new Float32Array(n * 2 * 3);
    this.col = new Float32Array(n * 2 * 3);

    const index = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('color', this.colAttr);
    geo.setIndex(index);

    this.material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
  }

  reset(angle) {
    this.ang.fill(angle);
    this.z.fill(0);
  }

  // Le monde avance de dz : les anciens points reculent, la tête reste sur la sonde
  push(angle, dz) {
    for (let i = this.n - 1; i > 0; i--) {
      this.ang[i] = this.ang[i - 1];
      this.z[i] = this.z[i - 1] + dz;
    }
    this.ang[0] = angle;
    this.z[0] = 0;
  }

  sync(width, color, intensity) {
    const n = this.n;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const w = width * (1 - t);
      const fade = Math.pow(1 - t, 1.6) * intensity;
      const c = Math.cos(this.ang[i]);
      const s = Math.sin(this.ang[i]);
      const x = this.radius * c;
      const y = this.radius * s;
      const z = this.z[i];
      const v = i * 6;
      // décalage tangentiel (le long de la paroi)
      this.pos[v] = x - s * w;
      this.pos[v + 1] = y + c * w;
      this.pos[v + 2] = z;
      this.pos[v + 3] = x + s * w;
      this.pos[v + 4] = y - c * w;
      this.pos[v + 5] = z;
      const r = color.r * fade;
      const g = color.g * fade;
      const b = color.b * fade;
      this.col[v] = r;
      this.col[v + 1] = g;
      this.col[v + 2] = b;
      this.col[v + 3] = r;
      this.col[v + 4] = g;
      this.col[v + 5] = b;
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------------ */
/* Lignes de vitesse : segments qui filent le long de la paroi               */
/* ------------------------------------------------------------------------ */
export class SpeedLines {
  constructor(n, radius) {
    this.n = n;
    this.radius = radius;
    this.ang = new Float32Array(n);
    this.r = new Float32Array(n);
    this.z = new Float32Array(n);
    this.k = new Float32Array(n); // facteur de longueur propre à chaque trait
    for (let i = 0; i < n; i++) this.respawn(i, -10 - Math.random() * 150);

    this.pos = new Float32Array(n * 2 * 3);
    this.col = new Float32Array(n * 2 * 3);
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('color', this.colAttr);
    this.material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.lines = new THREE.LineSegments(geo, this.material);
    this.lines.frustumCulled = false;
  }

  respawn(i, z) {
    this.ang[i] = Math.random() * Math.PI * 2;
    this.r[i] = this.radius * (0.7 + Math.random() * 0.27);
    this.z[i] = z;
    this.k[i] = 0.6 + Math.random() * 0.8;
  }

  update(dt, v) {
    const dz = v * dt * 1.2;
    for (let i = 0; i < this.n; i++) {
      this.z[i] += dz;
      if (this.z[i] > 9) this.respawn(i, -150 - Math.random() * 20);
    }
  }

  sync(v, strength, color) {
    this.lines.visible = strength > 0.01;
    if (!this.lines.visible) return;
    for (let i = 0; i < this.n; i++) {
      const len = v * 0.11 * this.k[i];
      const x = Math.cos(this.ang[i]) * this.r[i];
      const y = Math.sin(this.ang[i]) * this.r[i];
      const o = i * 6;
      this.pos[o] = x;
      this.pos[o + 1] = y;
      this.pos[o + 2] = this.z[i];
      this.pos[o + 3] = x;
      this.pos[o + 4] = y;
      this.pos[o + 5] = this.z[i] - len;
      // tête lumineuse, queue éteinte (en additif, noir = transparent)
      this.col[o] = color.r * strength;
      this.col[o + 1] = color.g * strength;
      this.col[o + 2] = color.b * strength;
      this.col[o + 3] = 0;
      this.col[o + 4] = 0;
      this.col[o + 5] = 0;
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
  }
}
