// Page JEU : branche le moteur ORBITE sur l'interface (écrans, HUD, records, entrées).
import { initCommon } from './common.js';
import { createOrbite } from './jeu/engine.js';
import { createAudio } from './jeu/audio.js';
import {
  loadRecords, saveRecord, clearRecords, bestScore, getPlays, addPlay, isPersistent,
} from './jeu/scores.js';

const nf = new Intl.NumberFormat('fr-FR');
const df = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
const fmt = (n) => nf.format(Math.floor(n));

const LEFT_KEYS = ['arrowleft', 'a', 'q'];
const RIGHT_KEYS = ['arrowright', 'd'];
const PAUSE_KEYS = [' ', 'escape', 'p'];
const SCROLL_KEYS = [' ', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'pageup', 'pagedown'];

function start() {
  initCommon();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const records = initRecords();
  initGame(reduced, records);
  initScrollPlay();
  initReveals(reduced);
}

/* ------------------------------------------------------------------------ */
/* Tableau des records                                                       */
/* ------------------------------------------------------------------------ */
function initRecords() {
  const body = document.getElementById('rec-body');
  const best = document.getElementById('rec-best');
  const plays = document.getElementById('rec-plays');
  const combo = document.getElementById('rec-combo');
  const dist = document.getElementById('rec-distance');
  const note = document.getElementById('rec-note');
  const reset = document.getElementById('rec-reset');

  function render(highlight = -1) {
    const list = loadRecords();
    body.textContent = '';
    for (let i = 0; i < 5; i++) {
      const r = list[i];
      const tr = document.createElement('tr');
      if (i === highlight) tr.className = 'is-new';
      const cells = r
        ? [
          String(i + 1).padStart(2, '0'),
          fmt(r.score),
          `${fmt(r.distance || 0)} m`,
          `${r.maxCombo || 0}`,
          r.date ? df.format(new Date(r.date)) : '—',
        ]
        : [String(i + 1).padStart(2, '0'), '—', '—', '—', '—'];
      cells.forEach((text, c) => {
        const td = document.createElement(c === 0 ? 'th' : 'td');
        if (c === 0) td.scope = 'row';
        if (c === 2 || c === 4) td.className = 'col-opt';
        td.textContent = text;
        tr.appendChild(td);
      });
      if (!r) tr.classList.add('is-empty');
      body.appendChild(tr);
    }
    best.textContent = fmt(list.length ? list[0].score : 0);
    plays.textContent = fmt(getPlays());
    combo.textContent = fmt(list.reduce((m, r) => Math.max(m, r.maxCombo || 0), 0));
    dist.textContent = `${fmt(list.reduce((m, r) => Math.max(m, r.distance || 0), 0))} m`;
    if (!isPersistent()) {
      note.textContent = 'Stockage local indisponible (navigation privée ?) : vos scores sont gardés jusqu’à la fermeture de la page.';
    } else if (!list.length) {
      note.textContent = 'Aucune partie enregistrée pour l’instant. Le tunnel vous attend.';
    } else {
      note.textContent = '';
    }
  }

  // Effacement en deux temps (pas de boîte de dialogue bloquante)
  let armed = 0;
  reset.addEventListener('click', () => {
    if (!armed) {
      reset.textContent = 'Cliquer encore pour confirmer';
      reset.classList.add('is-armed');
      armed = window.setTimeout(() => {
        armed = 0;
        reset.textContent = 'Effacer mes records';
        reset.classList.remove('is-armed');
      }, 4000);
      return;
    }
    window.clearTimeout(armed);
    armed = 0;
    clearRecords();
    reset.textContent = 'Records effacés';
    reset.classList.remove('is-armed');
    window.setTimeout(() => { reset.textContent = 'Effacer mes records'; }, 2500);
    render();
  });

  render();
  return { render };
}

/* ------------------------------------------------------------------------ */
/* Jeu                                                                       */
/* ------------------------------------------------------------------------ */
function initGame(reduced, records) {
  const stage = document.getElementById('stage');
  const canvas = document.getElementById('game-canvas');
  if (!stage || !canvas) return;

  const root = document.documentElement;
  const screens = {};
  stage.querySelectorAll('[data-screen]').forEach((el) => { screens[el.dataset.screen] = el; });
  const flash = document.getElementById('stage-flash');
  const toast = document.getElementById('stage-toast');
  const live = document.getElementById('game-live');
  const shareStatus = document.getElementById('share-status');
  const btnSound = stage.querySelector('[data-action="sound"]');
  const btnFull = stage.querySelector('[data-action="fullscreen"]');

  const audio = createAudio();
  let best = bestScore();
  let lastStats = null;

  function showScreen(name) {
    Object.keys(screens).forEach((key) => {
      const on = key === name;
      screens[key].classList.toggle('is-active', on);
      if (on) screens[key].removeAttribute('inert');
      else screens[key].setAttribute('inert', '');
    });
  }

  // Ne déplace le focus que s'il est déjà dans la scène (jamais de vol de focus)
  function focusIn(selector) {
    if (!stage.contains(document.activeElement)) return;
    const el = stage.querySelector(selector);
    if (el) el.focus({ preventScroll: true });
  }

  /* --- HUD : on ne touche au DOM que si la valeur change ---------------- */
  const hudEl = {
    score: document.getElementById('hud-score'),
    best: document.getElementById('hud-best'),
    mult: document.getElementById('hud-mult'),
    combo: document.getElementById('hud-combo'),
    comboWrap: document.getElementById('hud-combo-wrap'),
    speed: document.getElementById('hud-speed'),
    tier: document.getElementById('hud-tier'),
    shield: document.getElementById('hud-shield'),
    shieldWrap: document.getElementById('hud-shield-wrap'),
    slow: document.getElementById('hud-slow'),
    slowWrap: document.getElementById('hud-slow-wrap'),
  };
  const prev = { score: -1, best: -1, mult: -1, combo: -1, speed: -1, tier: -1, shield: -1, slow: -1 };

  function onHud(h) {
    if (h.score !== prev.score) {
      prev.score = h.score;
      hudEl.score.textContent = fmt(h.score);
    }
    const b = Math.max(best, h.score);
    if (b !== prev.best) {
      prev.best = b;
      hudEl.best.textContent = fmt(b);
    }
    if (h.mult !== prev.mult) {
      prev.mult = h.mult;
      hudEl.mult.textContent = `×${h.mult}`;
      hudEl.comboWrap.dataset.level = String(Math.min(h.mult, 8));
    }
    if (h.combo !== prev.combo) {
      prev.combo = h.combo;
      hudEl.combo.textContent = `${h.combo} orbe${h.combo > 1 ? 's' : ''}`;
    }
    const sp = Math.round(h.speed / 5) * 5;
    if (sp !== prev.speed) {
      prev.speed = sp;
      hudEl.speed.textContent = fmt(sp);
    }
    if (h.tier !== prev.tier) {
      prev.tier = h.tier;
      hudEl.tier.textContent = `Palier ${h.tier}`;
    }
    const sh = Math.round(h.shield * 200) / 200;
    if (sh !== prev.shield) {
      prev.shield = sh;
      hudEl.shield.style.transform = `scaleX(${sh})`;
      hudEl.shieldWrap.classList.toggle('is-on', sh > 0);
    }
    const sl = Math.round(h.slow * 200) / 200;
    if (sl !== prev.slow) {
      prev.slow = sl;
      hudEl.slow.style.transform = `scaleX(${sl})`;
      hudEl.slowWrap.classList.toggle('is-on', sl > 0);
    }
  }

  /* --- Retours visuels ---------------------------------------------------- */
  function doFlash(color, strength) {
    if (!flash.animate) return;
    flash.style.background = color;
    const peak = reduced ? strength * 0.4 : strength;
    flash.animate([{ opacity: peak }, { opacity: 0 }], { duration: reduced ? 250 : 520, easing: 'ease-out' });
  }

  function showToast(text, tone = '') {
    toast.textContent = text;
    toast.dataset.tone = tone;
    if (!toast.animate) return;
    toast.animate(
      reduced
        ? [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }]
        : [
          { opacity: 0, transform: 'translate(-50%, 12px) scale(0.92)' },
          { opacity: 1, transform: 'translate(-50%, 0) scale(1)', offset: 0.15 },
          { opacity: 1, transform: 'translate(-50%, 0) scale(1)', offset: 0.8 },
          { opacity: 0, transform: 'translate(-50%, -10px) scale(1)' },
        ],
      { duration: 1600, easing: 'ease-out' },
    );
  }

  function onEvent(type, data) {
    switch (type) {
      case 'orb':
        if (data.up) showToast(`Combo ×${data.mult}`, 'orb');
        break;
      case 'combo-lost':
        if (data.lost >= 3) showToast('Combo perdu', 'muted');
        break;
      case 'power':
        if (data.type === 'shield') {
          showToast('Bouclier activé', 'shield');
          doFlash('rgba(0, 229, 255, 0.5)', 0.35);
        } else {
          showToast('Ralenti', 'slow');
          doFlash('rgba(177, 140, 255, 0.5)', 0.35);
        }
        break;
      case 'shield-break':
        showToast('Bouclier brisé', 'shield');
        doFlash('rgba(0, 229, 255, 0.8)', 0.6);
        break;
      case 'hit':
        doFlash('rgba(255, 61, 129, 0.9)', 0.85);
        break;
      case 'tier':
        showToast(`Palier ${data.tier} · zone ${data.name}`, 'tier');
        live.textContent = `Palier ${data.tier} atteint.`;
        break;
      default:
    }
  }

  /* --- Fin de partie ------------------------------------------------------ */
  function onGameOver(stats) {
    lastStats = stats;
    addPlay();
    const entry = {
      score: stats.score,
      distance: stats.distance,
      maxCombo: stats.maxCombo,
      orbs: stats.orbs,
      date: new Date().toISOString(),
    };
    const res = saveRecord(entry);
    best = Math.max(best, stats.score);
    records.render(res.rank);

    document.getElementById('over-score').textContent = fmt(stats.score);
    document.getElementById('over-badge').hidden = !(res.isBest && stats.score > 0);
    document.getElementById('over-rank').textContent = res.rank >= 0
      ? `Entrée n°${res.rank + 1} de votre classement`
      : 'Hors du top 5, cette fois.';
    document.getElementById('over-distance').textContent = `${fmt(stats.distance)} m`;
    document.getElementById('over-orbs').textContent = fmt(stats.orbs);
    document.getElementById('over-combo').textContent = `${stats.maxCombo} (×${stats.maxMult})`;
    document.getElementById('over-time').textContent = `${stats.time.toFixed(1).replace('.', ',')} s`;
    shareStatus.textContent = '';
    live.textContent = `Signal perdu. Score : ${fmt(stats.score)} points${res.isBest && stats.score > 0 ? ', nouveau record' : ''}.`;
  }

  function onState(state) {
    stage.dataset.state = state;
    root.classList.toggle('orbite-playing', state === 'playing' || state === 'dying');
    if (state === 'paused') {
      showScreen('pause');
      focusIn('[data-action="resume"]');
    } else if (state === 'over') {
      showScreen('over');
      focusIn('[data-screen="over"] [data-action="restart"]');
    } else if (state === 'title') {
      showScreen('title');
      focusIn('[data-action="play"]');
    } else {
      showScreen('');
    }
  }

  const game = createOrbite({
    canvas, audio, reducedMotion: reduced, hooks: { onHud, onEvent, onGameOver, onState },
  });

  if (!game) {
    stage.dataset.state = 'error';
    showScreen('error');
    stage.querySelectorAll('.stage-tools button').forEach((b) => { b.disabled = true; });
    return;
  }

  /* --- Actions ------------------------------------------------------------- */
  function play() {
    // focus sur la scène AVANT de masquer l'écran, sinon le focus se perd (et met en pause)
    stage.focus({ preventScroll: true });
    game.start();
  }

  function resume() {
    stage.focus({ preventScroll: true });
    game.resume();
  }

  async function share() {
    if (!lastStats) return;
    const url = window.location.href.split('#')[0];
    const text = `J'ai fait ${fmt(lastStats.score)} points sur ORBITE (${fmt(lastStats.distance)} m, combo max ${lastStats.maxCombo}). Tu fais mieux ? ${url}`;
    const ok = await copyText(text);
    shareStatus.textContent = ok
      ? 'Score copié dans le presse-papier. Collez-le où vous voulez.'
      : 'Copie impossible ici : sélectionnez votre score à la main.';
    focusIn('[data-action="share"]');
  }

  function toggleSound() {
    const on = audio.setEnabled(!audio.enabled);
    btnSound.setAttribute('aria-pressed', String(on));
    btnSound.setAttribute('aria-label', on ? 'Couper le son' : 'Activer le son');
  }

  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
  const canFullscreen = Boolean(stage.requestFullscreen || stage.webkitRequestFullscreen);
  if (!canFullscreen) btnFull.hidden = true;

  function toggleFullscreen() {
    if (fsElement()) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) {
        const p = exit.call(document);
        if (p && p.catch) p.catch(() => {});
      }
    } else {
      const req = stage.requestFullscreen || stage.webkitRequestFullscreen;
      const p = req.call(stage);
      if (p && p.catch) p.catch(() => {});
    }
    stage.focus({ preventScroll: true });
  }

  function onFullscreenChange() {
    const on = fsElement() === stage;
    btnFull.setAttribute('aria-pressed', String(on));
    btnFull.setAttribute('aria-label', on ? 'Quitter le plein écran' : 'Plein écran');
    stage.classList.toggle('is-fullscreen', on);
    // Échap en plein écran ne nous parvient pas : on met en pause par sécurité
    if (!on) game.pause();
    game.resize();
  }
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);

  stage.addEventListener('click', (e) => {
    const btn = e.target instanceof Element && e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    switch (btn.dataset.action) {
      case 'play':
      case 'restart':
        play();
        break;
      case 'resume':
        resume();
        break;
      case 'pause':
        game.pause();
        break;
      case 'quit':
        stage.focus({ preventScroll: true });
        game.quit();
        break;
      case 'share':
        share();
        break;
      case 'sound':
        toggleSound();
        break;
      case 'fullscreen':
        toggleFullscreen();
        break;
      default:
    }
  });

  /* --- Clavier : seulement quand la scène (ou un de ses boutons) a le focus - */
  stage.addEventListener('keydown', (e) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
    const onButton = e.target instanceof Element && e.target.closest('button');
    const state = game.state;

    if (SCROLL_KEYS.includes(key) && !(key === ' ' && onButton && state !== 'playing')) e.preventDefault();

    if (state === 'playing') {
      if (LEFT_KEYS.includes(key)) game.setKey('left', true);
      else if (RIGHT_KEYS.includes(key)) game.setKey('right', true);
      else if (PAUSE_KEYS.includes(key)) {
        e.preventDefault();
        game.pause();
      }
      return;
    }
    if (e.repeat) return;
    if (state === 'paused') {
      if (key === 'escape' || key === 'p' || (key === ' ' && !onButton)) {
        e.preventDefault();
        resume();
      }
      return;
    }
    if ((state === 'title' || state === 'over') && !onButton && (key === ' ' || key === 'enter')) {
      e.preventDefault();
      play();
    }
  });

  window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (LEFT_KEYS.includes(key)) game.setKey('left', false);
    if (RIGHT_KEYS.includes(key)) game.setKey('right', false);
  });

  // Focus perdu pendant la partie : pause (sinon on joue à l'aveugle)
  stage.addEventListener('focusout', (e) => {
    if (e.relatedTarget instanceof Node && stage.contains(e.relatedTarget)) return;
    game.clearInput();
    game.pause();
  });
  window.addEventListener('blur', () => {
    game.clearInput();
    game.pause();
  });

  /* --- Boucle active seulement si visible ---------------------------------- */
  let pageVisible = !document.hidden;
  let onScreen = false;
  const updateActive = () => game.setActive(pageVisible && onScreen);

  document.addEventListener('visibilitychange', () => {
    pageVisible = !document.hidden;
    if (document.hidden) game.pause();
    updateActive();
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      const en = entries[entries.length - 1];
      onScreen = en.isIntersecting;
      if (en.intersectionRatio < 0.3) game.pause();
      updateActive();
    }, { threshold: [0, 0.3] }).observe(stage);
  } else {
    onScreen = true;
    updateActive();
  }

  stage.dataset.state = game.state;
}

// Presse-papier avec repli pour les contextes non sécurisés
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) { /* on tente le repli */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.opacity = '0';
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
/* Liens "jouer" : défilement vers la scène puis focus sur le bouton         */
/* ------------------------------------------------------------------------ */
function initScrollPlay() {
  document.querySelectorAll('[data-scroll-play]').forEach((a) => {
    a.addEventListener('click', () => {
      window.setTimeout(() => {
        const btn = document.querySelector('.screen.is-active [data-action]');
        if (btn) btn.focus({ preventScroll: true });
      }, 700);
    });
  });
}

/* ------------------------------------------------------------------------ */
/* Apparitions au scroll (facultatives : tout reste visible sans GSAP)       */
/* ------------------------------------------------------------------------ */
function initReveals(reduced) {
  const gsap = window.gsap;
  const ST = window.ScrollTrigger;
  if (!gsap || !ST || reduced) return;
  gsap.registerPlugin(ST);

  // Titre : montée d'un bloc (découper en lettres casserait le dégradé en background-clip)
  const title = document.querySelector('.jeu-hero-title');
  if (title) gsap.from(title, { yPercent: 40, opacity: 0, duration: 1.2, ease: 'expo.out', delay: 0.2 });

  const items = gsap.utils.toArray('[data-reveal]');
  gsap.set(items, { opacity: 0, y: 36 });
  ST.batch(items, {
    start: 'top 90%',
    once: true,
    onEnter: (batch) => gsap.to(batch, {
      opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.08, overwrite: true,
    }),
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
