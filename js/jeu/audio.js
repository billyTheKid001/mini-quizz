// ORBITE — sons synthétisés avec la Web Audio API : aucun fichier, coupés par défaut.
// Le contexte audio n'est créé qu'au premier clic sur le bouton son.

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let enabled = false;

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
    } catch (err) {
      return false;
    }
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
    // Bruit blanc généré une fois, réutilisé par tous les impacts
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return true;
  }

  // Bip simple avec enveloppe et glissando optionnel
  function tone(freq, dur, type = 'sine', vol = 0.3, to = 0, delay = 0) {
    if (!enabled || !ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  // Souffle filtré (impacts)
  function noise(dur, vol, cutoff) {
    if (!enabled || !ctx) return;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, cutoff * 0.08), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.03);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      g.disconnect();
    };
  }

  return {
    get enabled() {
      return enabled;
    },
    // Renvoie l'état effectif (false si l'API est indisponible)
    setEnabled(on) {
      if (on && !ensure()) return false;
      enabled = Boolean(on);
      if (ctx) {
        const p = enabled ? ctx.resume() : ctx.suspend();
        if (p && p.catch) p.catch(() => {});
      }
      if (enabled) tone(880, 0.09, 'triangle', 0.2);
      return enabled;
    },
    orb(combo) {
      // la note monte avec le combo (un demi-ton par orbe, plafonné à deux octaves)
      const f = 523 * Math.pow(2, Math.min(combo, 24) / 12);
      tone(f, 0.11, 'triangle', 0.2, f * 1.5);
    },
    power(type) {
      const base = type === 'shield' ? 440 : 330;
      tone(base, 0.16, 'sine', 0.22);
      tone(base * 1.26, 0.16, 'sine', 0.22, 0, 0.07);
      tone(base * 1.5, 0.24, 'sine', 0.22, 0, 0.14);
      if (type === 'slow') tone(220, 0.6, 'sine', 0.15, 110, 0.1);
    },
    shieldBreak() {
      tone(1200, 0.28, 'square', 0.08, 180);
      noise(0.3, 0.3, 4000);
    },
    hit() {
      noise(0.7, 0.55, 1400);
      tone(170, 0.7, 'sawtooth', 0.22, 38);
    },
    start() {
      tone(220, 0.4, 'sine', 0.2, 880);
    },
    tier() {
      tone(660, 0.12, 'square', 0.06);
      tone(990, 0.2, 'square', 0.06, 0, 0.1);
    },
    pause() {
      tone(392, 0.1, 'sine', 0.12, 262);
    },
  };
}
