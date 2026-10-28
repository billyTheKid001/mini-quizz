// ORBITE — records locaux. localStorage peut être bloqué (navigation privée,
// politique du navigateur) : chaque accès est sous try/catch, avec repli en mémoire.

const KEY_SCORES = 'orbitale.orbite.records';
const KEY_PLAYS = 'orbitale.orbite.parties';
const MAX = 5;

let memoryScores = [];
let memoryPlays = 0;
let persistent = true;

function isValid(r) {
  return r && Number.isFinite(r.score) && r.score >= 0;
}

function read(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (err) {
    persistent = false;
    return null;
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (err) {
    persistent = false;
    return false;
  }
}

export function isPersistent() {
  read(KEY_SCORES);
  return persistent;
}

export function loadRecords() {
  const raw = read(KEY_SCORES);
  if (raw === null) return memoryScores.slice();
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter(isValid).sort((a, b) => b.score - a.score).slice(0, MAX);
  } catch (err) {
    return [];
  }
}

export function bestScore() {
  const list = loadRecords();
  return list.length ? list[0].score : 0;
}

// Ajoute une partie ; renvoie le classement et si c'est un nouveau record
export function saveRecord(entry) {
  const list = loadRecords();
  const previousBest = list.length ? list[0].score : 0;
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const top = list.slice(0, MAX);
  memoryScores = top.slice();
  write(KEY_SCORES, JSON.stringify(top));
  return {
    list: top,
    rank: top.indexOf(entry),
    isBest: entry.score > previousBest,
  };
}

export function clearRecords() {
  memoryScores = [];
  memoryPlays = 0;
  try {
    window.localStorage.removeItem(KEY_SCORES);
    window.localStorage.removeItem(KEY_PLAYS);
  } catch (err) {
    persistent = false;
  }
}

export function getPlays() {
  const raw = read(KEY_PLAYS);
  if (raw === null) return memoryPlays;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function addPlay() {
  const n = getPlays() + 1;
  memoryPlays = n;
  write(KEY_PLAYS, String(n));
  return n;
}
