// script.js

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const $ = id => document.getElementById(id);

let spread = null;
let variantIndex = 0;
let deck = [];          // face-down card numbers, in fan order
let placed = [];        // card number per position, in drawing order
let reversed = null;    // per position, whether the card came up reversed; null when reversals are off
// The question-by-question spread has no fixed positions: each question in turn gets its
// cards, `{ question, cards }` per question, until the reading is finished by hand.
let rounds = null;
let finished = false;
let extra = 0;          // clarifiers asked for after a fixed spread was complete, drawn or still to draw
let base = null;        // a saved reading's cards as the journal has them, while changes to them are not saved yet
let flying = false;
let fanMode = 'fan';    // 'fan' or 'piles' (while the deck is cut)
let cutDone = false;
let readingId = null;   // journal id once the reading is saved
let interpretation = null;
let ownReading = false;  // saved in this sitting, so undo may still change it
let pollTimer = null;
let saving = false;
let saveFailed = false;
let pendingSave = null;  // the save in flight, so undo can cancel exactly that one
let verified = true;     // false while a journal reading opened from a link awaits the server's copy
let notes = [];          // "coming back to this" notes of the saved reading on screen
let earlier = [];        // interpretations a newer one replaced, newest first
let localKey = null;     // this reading's entry among the readings kept on this device
let drawnAt = null;      // when the spread was completed, ISO time

// Bumped whenever the reading on screen is replaced or changed. Anything asynchronous (a
// card in flight, a save, a poll, a debounced question update) captures it first and
// does nothing if it has moved on, so a slow response never lands on another reading.
let gen = 0;
const isCurrent = g => g === gen;

// A question edit still waiting for its debounce belongs to the reading on screen; send
// it now, before anything about that reading changes. If the reading's first save is
// still in flight, hand the latest question to that save instead.
function flushQuestion() {
  if (questionTimer) {
    clearTimeout(questionTimer);
    questionTimer = null;
    if (readingId && spread && verified) sendEdits();
  }
  if (pendingSave && !pendingSave.cancelled && spread && isDone()) {
    try {
      pendingSave.final = { ...ownWords(), summary: readingText() };
    } catch {}
  }
}

// What Batu writes himself on a reading. A question-by-question reading keeps all its
// questions in `question`, one line each, in order.
function ownWords() {
  return { question: spread?.session ? joinQuestions(rounds) : $('question').value.trim(), impression: $('impression').value.trim() };
}

function joinQuestions(rs) {
  const lines = rs.map(r => r.question.replace(/\s+/g, ' ').trim());
  return lines.some(Boolean) ? lines.join('\n') : '';
}

// The other way: the questions of a reading with these card counts per question, and the
// questions before which the deck was made whole again.
const splitRounds = (counts, question, reshuffled = []) => {
  const qs = (question || '').split('\n');
  return counts.map((cards, i) => ({ question: qs[i] || '', cards, ...(reshuffled.includes(i) && { fresh: true }) }));
};

// The questions (from 0) before which the deck was made whole again.
const reshuffledOf = rs => (rs ? rs.flatMap((r, i) => (r.fresh ? [i] : [])) : []);

// The cards drawn since the deck was last made whole: only these are out of the deck.
function sinceWhole(rs, cards) {
  const i = rs ? rs.findLastIndex(r => r.fresh) : -1;
  return i < 0 ? cards : cards.slice(rs.slice(0, i).reduce((t, r) => t + r.cards, 0));
}

// No card twice between two reshuffles.
function distinctCards(rs, cards) {
  const cuts = [0, ...reshuffledOf(rs).map(i => rs.slice(0, i).reduce((t, r) => t + r.cards, 0)), cards.length];
  return cuts.slice(1).every((b, k) => new Set(cards.slice(cuts[k], b)).size === b - cuts[k]);
}

function beginTransition() {
  // A card in the air is already drawn: keep the reading with it, since the flight's own
  // update will not run once the reading is left.
  if (spread && flying) keepLocal();
  flushQuestion();
  // A save still in flight belongs to the reading being left, which now has its final
  // words; the next reading must not overwrite them.
  pendingSave = null;
  hideToastAction();
  gen++;
  flying = false;
  saving = false;
  saveFailed = false;
  document.querySelectorAll('.flyer').forEach(f => f.remove());
  stopPolling();
  $('noteText').value = '';
  setNotePrompt('');
}

// The journal exists only where the server answers (the tailnet copy, not GitHub Pages).
const server = { on: false, jev: false };

// ---------- decks ----------

// Osho Zen: 1–23 Major Arcana (with The Master), then Clouds, Fire, Rainbows and Water.
// The numbers are file order, not deck order; `ranks` below lists the cards in deck order.
function oshoSuit(n) {
  if (n <= 23) return 'Major Arcana';
  if (n <= 37) return 'Clouds';
  if (n <= 51) return 'Fire';
  if (n <= 65) return 'Rainbows';
  return 'Water';
}

// Rank of each card within its suit, as printed on the cards. Listed in deck order.
const ranks = {
  'The Fool': '0', 'Existence': 'I', 'Inner Voice': 'II', 'Creativity': 'III', 'The Rebel': 'IV',
  'No-Thingness': 'V', 'The Lovers': 'VI', 'Awareness': 'VII', 'Courage': 'VIII', 'Aloneness': 'IX',
  'Change': 'X', 'Breakthrough': 'XI', 'New Vision': 'XII', 'Transformation': 'XIII', 'Integration': 'XIV',
  'Conditioning': 'XV', 'Thunderbolt': 'XVI', 'Silence': 'XVII', 'Past Lives': 'XVIII', 'Innocence': 'XIX',
  'Beyond Illusion': 'XX', 'Completion': 'XXI', 'The Master': 'The Master',
  'Consciousness': 'Ace', 'Schizophrenia': '2', 'Ice-olation': '3', 'Postponement': '4', 'Comparison': '5',
  'The Burden': '6', 'Politics': '7', 'Guilt': '8', 'Sorrow': '9', 'Rebirth': '10',
  'Mind': 'Page', 'Fighting': 'Knight', 'Morality': 'Queen', 'Control': 'King',
  'The Source': 'Ace', 'Possibilities': '2', 'Experiencing': '3', 'Participation': '4', 'Totality': '5',
  'Success': '6', 'Stress': '7', 'Traveling': '8', 'Exhaustion': '9', 'Suppression': '10',
  'Playfulness': 'Page', 'Intensity': 'Knight', 'Sharing': 'Queen', 'The Creator': 'King',
  'Maturity': 'Ace', 'Moment To Moment': '2', 'Guidance': '3', 'The Miser': '4', 'The Outsider': '5',
  'Compromise': '6', 'Patience': '7', 'Ordinariness': '8', 'Ripeness': '9', 'We Are The World': '10',
  'Adventure': 'Page', 'Slowing Down': 'Knight', 'Flowering': 'Queen', 'Abundance': 'King',
  'Going With The Flow': 'Ace', 'Friendliness': '2', 'Celebration': '3', 'Turning in': '4',
  'Clinging to the Past': '5', 'The Dream': '6', 'Projections': '7', 'Letting Go': '8', 'Laziness': '9',
  'Harmony': '10', 'Understanding': 'Page', 'Trust': 'Knight', 'Receptivity': 'Queen', 'Healing': 'King',
};

const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV',
  'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'];

// Everything that differs between the two decks. `texts` gives the card window's sections
// and `about` the card's part of the copied reading; both know whether it came up reversed.
const DECKS = {
  osho: {
    id: 'osho',
    title: 'Osho Zen Tarot',
    total: 79,
    suits: ['Major Arcana', 'Clouds', 'Fire', 'Rainbows', 'Water'],
    suitSize: { 'Major Arcana': 23, Clouds: 14, Fire: 14, Rainbows: 14, Water: 14 },
    suitOf: oshoSuit,
    name: n => cardNames[n - 1],
    // "Major Arcana IX", "Major Arcana, The Master", "Page of Clouds"
    rank(n) {
      const suit = oshoSuit(n);
      const rank = ranks[cardNames[n - 1]];
      if (suit === 'Major Arcana') return rank === 'The Master' ? 'Major Arcana, The Master' : `Major Arcana ${rank}`;
      return `${rank} of ${suit}`;
    },
    order: () => Object.keys(ranks).map(name => cardNames.indexOf(name) + 1),
    // Full size for the detail view; small copies everywhere else.
    image: n => `assets/CardPictures/card_${n}.jpg`,
    thumb: n => `assets/CardPictures/small/card_${n}.webp`,
    texts: n => [[null, cardData[n].text], ['Commentary', cardData[n].commentary]],
    about: n => ['Osho on this card:', cardData[n].text, '', 'Commentary:', cardData[n].commentary],
    note: [
      'About the deck: the Osho Zen Tarot is about understanding the here and now, not predicting the future.',
      'The Major Arcana (0 to XXI, plus The Master) are the central themes of the spiritual journey; when one appears it carries special weight, and a reading without any suggests a passing chapter rather than a turning point.',
      'The four suits: Fire is action and response, following the gut; Water is the emotions, receptive; Clouds is the mind, which hides the light but comes and goes; Rainbows is the practical, material side of life, earth and spirit as one.',
      "Treat the cards and Osho's words as a mirror for reflection, not as facts, predictions, or medical or psychological diagnoses, and read positions about the future or past lives in that same reflective way.",
    ].join(' '),
  },
  // Rider-Waite-Smith (1909): 1–22 Major Arcana, then Wands, Cups, Swords and Pentacles,
  // each Ace to King, so the numbers are deck order.
  rws: {
    id: 'rws',
    title: 'Rider-Waite Tarot',
    total: 78,
    suits: ['Major Arcana', 'Wands', 'Cups', 'Swords', 'Pentacles'],
    suitSize: { 'Major Arcana': 22, Wands: 14, Cups: 14, Swords: 14, Pentacles: 14 },
    suitOf: n => (n <= 22 ? 'Major Arcana' : ['Wands', 'Cups', 'Swords', 'Pentacles'][Math.floor((n - 23) / 14)]),
    name: n => rwsCards[n - 1].name,
    rank: n => (n <= 22 ? `Major Arcana ${ROMAN[n - 1]}` : `Minor Arcana, ${DECKS.rws.suitOf(n)}`),
    order: () => Array.from({ length: 78 }, (_, i) => i + 1),
    image: n => `assets/rws/card_${n}.jpg`,
    thumb: n => `assets/rws/small/card_${n}.webp`,
    reversals: true,
    texts: (n, rev) => rev
      ? [[null, rwsCards[n - 1].reversed], ['Upright', rwsCards[n - 1].upright]]
      : [[null, rwsCards[n - 1].upright], ['Reversed', rwsCards[n - 1].reversed]],
    about: (n, rev) => rev
      ? ['Drawn reversed. The reversed meaning:', rwsCards[n - 1].reversed, '', 'The upright meaning, for context:', rwsCards[n - 1].upright]
      : ['Meaning:', rwsCards[n - 1].upright],
    note: [
      'About the deck: the Rider-Waite-Smith tarot (A.E. Waite and Pamela Colman Smith, 1909), the classic 78-card deck.',
      'The Major Arcana (0 to XXI) are the great themes and turning points of a life; when one appears it carries special weight, and a reading without any suggests a passing chapter rather than a turning point.',
      'The four suits: Wands are fire, drive, desire and creativity; Cups are water, feeling, relationship and intuition; Swords are air, thought, truth and conflict; Pentacles are earth, body, work, money and home.',
      'Treat the cards as a mirror for reflection, not as facts, predictions, or medical or psychological diagnoses, and read positions about the future in that same reflective way.',
    ].join(' '),
  },
};

// A journal reading names its deck in `deck`; one kept on this device in `deckId`, since
// its `deck` is the face-down cards. Both are Osho Zen when they predate the second deck.
const readingDeck = r => DECKS[r?.deck] || DECKS.osho;
const entryDeck = e => DECKS[e?.deckId] || DECKS.osho;

// The deck the site shows, remembered on this device.
let D = DECKS.osho;
try { D = DECKS[localStorage.getItem('tarot-deck')] || DECKS.osho; } catch {}

// Whether Rider-Waite readings can draw reversed cards, remembered on this device.
let reversals = false;
try { reversals = localStorage.getItem('tarot-reversals') === 'on'; } catch {}

// `dk` is a deck from DECKS (`deck` is the face-down cards of the reading on screen).
const cardName = (n, dk = D) => dk.name(n);
const cardRank = (n, dk = D) => dk.rank(n);
const cardImage = (n, dk = D) => dk.image(n);
const cardThumb = (n, dk = D) => dk.thumb(n);
const isRev = i => !!reversed?.[i];
const allCards = (dk = D) => Array.from({ length: dk.total }, (_, i) => i + 1);

// The spreads a deck offers: a spread without `decks` belongs to the Osho Zen deck only.
const spreadsOf = (dk = D) => spreads.filter(s => (s.decks || ['osho']).includes(dk.id));
const findSpread = (id, dk = D) => spreadsOf(dk).find(s => s.id === id);

function randomInt(max) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return Math.floor((buf[0] / 2 ** 32) * max);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function paragraphs(container, text) {
  container.replaceChildren();
  text.split(/\r?\n\s*\r?\n/).forEach(chunk => {
    const p = document.createElement('p');
    p.textContent = chunk.trim();
    container.appendChild(p);
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Just enough Markdown for an interpretation: headings, lists, bold, italics, paragraphs.
function renderMarkdown(text) {
  const inline = s => escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>');
  return text.trim().split(/\r?\n\s*\r?\n/).map(block => {
    const lines = block.split(/\r?\n/);
    const heading = block.match(/^(#{1,4})\s+(.*)$/);
    if (heading && lines.length === 1) return `<h${Math.min(heading[1].length + 2, 5)}>${inline(heading[2])}</h${Math.min(heading[1].length + 2, 5)}>`;
    if (lines.every(l => /^\s*[-*]\s+/.test(l))) {
      return `<ul>${lines.map(l => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`;
    }
    if (lines.every(l => /^\s*\d+[.)]\s+/.test(l))) {
      return `<ol>${lines.map(l => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`;
    }
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('');
}

function formatDate(iso, opts = { day: 'numeric', month: 'long', year: 'numeric' }) {
  return new Date(iso).toLocaleDateString(undefined, opts);
}

// ---------- sound ----------

// Recorded effects (see the README for sources, all CC0). Several takes per action, so
// repeated draws do not sound identical.
const SOUNDS = {
  shuffle: ['shuffle'],
  fan: ['fan'],
  slide: ['slide-1', 'slide-2', 'slide-3'],
  place: ['place-1', 'place-2', 'place-3', 'place-4'],
  cut: ['shove-1', 'shove-2'],
  coinFlick: ['coin-flick'],
  coinLand: ['coin-land'],
};
const SOUND_GAIN = 0.7;

const sound = { on: false, ctx: null, buffers: {}, loading: null };
try { sound.on = localStorage.getItem('tarot-sound') === 'on'; } catch {}

function audio() {
  if (!sound.ctx) sound.ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (sound.ctx.state === 'suspended') sound.ctx.resume();
  return sound.ctx;
}

function loadSounds() {
  if (sound.loading) return sound.loading;
  const ctx = audio();
  sound.loading = Promise.all(Object.values(SOUNDS).flat().map(async name => {
    const res = await fetch(`assets/sounds/${name}.mp3`);
    sound.buffers[name] = await ctx.decodeAudioData(await res.arrayBuffer());
  })).catch(() => { sound.loading = null; });
  return sound.loading;
}

function play(name, delay = 0) {
  if (!sound.on) return;
  const takes = SOUNDS[name];
  const buffer = takes && sound.buffers[takes[randomInt(takes.length)]];
  if (!buffer) return;
  try {
    const ctx = audio();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = SOUND_GAIN;
    src.connect(gain).connect(ctx.destination);
    src.start(ctx.currentTime + delay);
  } catch {}
}

function renderSoundButton() {
  const b = $('soundButton');
  b.querySelector('span').textContent = sound.on ? 'Sound: on' : 'Sound: off';
  b.setAttribute('aria-pressed', String(sound.on));
  b.classList.toggle('on', sound.on);
}

function toggleSound() {
  sound.on = !sound.on;
  try { localStorage.setItem('tarot-sound', sound.on ? 'on' : 'off'); } catch {}
  renderSoundButton();
  if (sound.on) loadSounds().then(() => play('place'));
}

// ---------- layout geometry ----------

function bounds(positions) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  // `above`: room kept free above a card, for a question's tag.
  positions.forEach(({ x, y, rot, above = 0 }) => {
    const a = (rot * Math.PI) / 180;
    const hw = 0.5 * Math.abs(Math.cos(a)) + 0.75 * Math.abs(Math.sin(a));
    const hh = 0.5 * Math.abs(Math.sin(a)) + 0.75 * Math.abs(Math.cos(a));
    minX = Math.min(minX, x - hw); maxX = Math.max(maxX, x + hw);
    minY = Math.min(minY, y - hh - above); maxY = Math.max(maxY, y + hh);
  });
  const pad = 0.06;
  return { minX: minX - pad, minY: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad };
}

// Lays positions out inside `el` as absolutely placed slots; returns the slots. With
// `keep`, slots already there stay (with their cards) and only move: a reading that grows
// card by card is laid out again without flipping every card anew.
function layout(el, positions, keep = false) {
  const b = bounds(positions);
  el.style.setProperty('--ratio', b.w / b.h);
  if (!keep) el.replaceChildren();
  while (el.children.length > positions.length) el.lastChild.remove();
  return positions.map((p, i) => {
    let slot = el.children[i];
    if (!slot) {
      slot = document.createElement('div');
      slot.className = 'slot';
      el.appendChild(slot);
    }
    slot.style.left = `${((p.x - 0.5 - b.minX) / b.w) * 100}%`;
    slot.style.top = `${((p.y - 0.75 - b.minY) / b.h) * 100}%`;
    slot.style.width = `${(1 / b.w) * 100}%`;
    slot.style.height = `${(1.5 / b.h) * 100}%`;
    slot.style.zIndex = i + 1;
    if (p.rot) slot.style.transform = `rotate(${p.rot}deg)`;
    return slot;
  });
}

// ---------- home: card of the day and the spread picker ----------

// The same card all day, for everyone: an FNV-1a hash of the local date picks it. The
// Rider-Waite key has a prefix so the two decks do not land on the same number every day.
function cardOfTheDay(date = new Date()) {
  const key = `${D.id === 'osho' ? '' : `${D.id}:`}${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  let h = 2166136261;
  for (const ch of key) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % D.total) + 1;
}

function renderDaily() {
  const n = cardOfTheDay();
  $('dailyImage').src = cardThumb(n);
  $('dailyImage').alt = cardName(n);
  $('dailyDate').textContent = `Card of the day · ${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}`;
  $('dailyName').textContent = cardName(n);
  $('dailyRank').textContent = cardRank(n);
  $('dailyExcerpt').textContent = D.texts(n)[0][1].split(/\r?\n\s*\r?\n/)[0].trim();
  const open = () => openCard(n, null);
  $('dailyCard').onclick = open;
  $('dailyMore').onclick = open;
}

function renderPicker() {
  clearAsk();
  const grid = $('spreadGrid');
  grid.replaceChildren();
  spreadsOf().forEach(s => {
    const tile = document.createElement('a');
    tile.className = 'spread-tile';
    tile.href = `#${s.id}`;
    const mini = document.createElement('div');
    mini.className = 'mini-board';
    layout(mini, s.variants[0].positions);
    const counts = [...new Set(s.variants.map(v => v.positions.length))];
    const count = s.session ? 'Three cards a question'
      : counts.length > 1 ? `${Math.min(...counts)}–${Math.max(...counts)} cards` : `${counts[0]} card${counts[0] > 1 ? 's' : ''}`;
    tile.append(mini);
    tile.insertAdjacentHTML('beforeend', '<span class="tile-name"></span><span class="tile-count"></span>');
    tile.querySelector('.tile-name').textContent = s.name;
    tile.querySelector('.tile-count').textContent = count;
    if (s.hint) {
      const hint = document.createElement('span');
      hint.className = 'tile-hint';
      hint.innerHTML = '<span></span><span class="tile-use"></span>';
      hint.firstChild.textContent = s.hint[0];
      hint.lastChild.textContent = s.hint[1];
      tile.appendChild(hint);
    }
    grid.appendChild(tile);
  });
}

// ---------- kept on this device ----------

// A reading in progress, or a finished one the journal has not received yet, is kept in
// localStorage until it is saved, so a closed tab or a dropped connection loses nothing.
// At most one unfinished reading is kept (the latest); finished ones wait until they save.
const LOCAL_STORE = 'tarot-local';

function localReadings() {
  try { return JSON.parse(localStorage.getItem(LOCAL_STORE)) || []; } catch { return []; }
}

// No count limit: only one unfinished reading is ever kept, and finished ones must not be
// dropped before they reach the journal.
function storeLocal(list) {
  try {
    localStorage.setItem(LOCAL_STORE, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

// Kept readings whose save is in flight in this page, counted per key, so the home list
// and the startup flush leave them alone and nothing posts the same reading twice.
const savingKeys = new Map();
const claim = key => savingKeys.set(key, (savingKeys.get(key) || 0) + 1);
const release = key => (savingKeys.get(key) > 1 ? savingKeys.set(key, savingKeys.get(key) - 1) : savingKeys.delete(key));

function dropLocal(key) {
  storeLocal(localReadings().filter(e => e.key !== key));
}

function entryDone(e) {
  const s = findSpread(e.spread, entryDeck(e));
  if (s?.session) return !!e.finished;
  return !!s && e.placed.length >= s.variants[e.variant].positions.length + (e.extra || 0);
}

// Questions of a question-by-question reading, from storage or a link: card counts that
// add up to the cards drawn, every question but the last with its three cards at least.
function validRounds(rs, cards, done) {
  return Array.isArray(rs) && rs.length > 0 && rs.every(r => r && typeof r.question === 'string' && Number.isInteger(r.cards) && r.cards >= 0) &&
    rs.slice(0, done ? undefined : -1).every(r => r.cards >= 3) && rs.reduce((t, r) => t + r.cards, 0) === cards.length;
}

// Reversed flags, from storage or a link: none at all, or one boolean per card.
function validReversed(rev, cards) {
  return rev == null || (Array.isArray(rev) && rev.length === cards.length && rev.every(x => typeof x === 'boolean'));
}

// Entries are read back from storage, so they are checked like a link would be.
function validEntry(e) {
  const dk = entryDeck(e);
  const s = e && findSpread(e.spread, dk);
  const ok = n => Number.isInteger(n) && n >= 1 && n <= dk.total;
  return !!s && Number.isInteger(e.variant) && e.variant >= 0 && e.variant < s.variants.length &&
    Array.isArray(e.placed) && e.placed.every(ok) &&
    (s.session ? validRounds(e.rounds, e.placed, !!e.finished)
      : Number.isInteger(e.extra ?? 0) && (e.extra ?? 0) >= 0 && e.placed.length <= s.variants[e.variant].positions.length + (e.extra ?? 0)) &&
    Array.isArray(e.deck) && e.deck.every(ok) && distinctCards(s.session ? e.rounds : null, e.placed) &&
    new Set([...sinceWhole(s.session ? e.rounds : null, e.placed), ...e.deck]).size === sinceWhole(s.session ? e.rounds : null, e.placed).length + e.deck.length &&
    validReversed(e.reversed, e.placed);
}

// Where the journal exists: the server has answered on this origin before, so a finished
// reading that could not be saved (offline, say) is kept until it can be.
let journalOrigin = false;
try { journalOrigin = localStorage.getItem('tarot-journal') === 'yes'; } catch {}

const newKey = () => crypto.randomUUID?.() ?? String(Math.random()).slice(2);

function keepLocal() {
  if (!localKey || !spread) return;
  // One kept copy per journal reading: an older one would overwrite newer cards when resumed.
  let list = localReadings().filter(e => e.key !== localKey && !(readingId && e.readingId === readingId));
  const done = isDone();
  // A saved reading being changed is kept too, until the journal has taken the change.
  if (placed.length && (readingId ? !!base : !done || journalOrigin)) {
    // The one unfinished new reading kept is per deck, so switching decks loses neither.
    if (!done) list = list.filter(e => entryDone(e) || entryDeck(e) !== D || e.readingId);
    list.unshift({
      key: localKey, deckId: D.id, spread: spread.id, variant: variantIndex, placed, reversed, deck, cutDone,
      ...(rounds && { rounds, finished }), ...(extra && { extra }), ...(readingId && { readingId, base }),
      question: rounds ? joinQuestions(rounds) : $('question').value, impression: $('impression').value, drawnAt, at: new Date().toISOString(),
    });
  }
  if (!storeLocal(list) && done && journalOrigin && !readingId && !keepLocal.warned) {
    keepLocal.warned = true;
    toast('This reading could not be kept on this device.');
  }
}

function resumeLocal(e) {
  // A home-list button can outlive its entry: re-read it, so a reading that was saved or
  // discarded meanwhile is not opened (and saved) a second time.
  const stored = localReadings().find(x => x.key === e?.key);
  if (!stored || savingKeys.has(e.key)) {
    if (stored) toast('This reading is being saved to your journal.');
    if (!$('pickerView').hidden) renderLocal();
    return;
  }
  e = stored;
  if (!validEntry(e)) {
    dropLocal(e.key);
    return showHome();
  }
  beginTransition();
  setDeck(entryDeck(e).id);
  setupSpread(findSpread(e.spread), e.variant);
  placed = e.placed;
  reversed = e.reversed ?? null;
  rounds = spread.session ? e.rounds : null;
  finished = spread.session && !!e.finished;
  extra = spread.session ? 0 : e.extra || 0;
  deck = e.deck;
  cutDone = e.cutDone || isParadox() && placed.length >= 2;
  fanMode = 'fan';
  resetJournalState();
  if (e.readingId) {
    readingId = e.readingId;
    base = Array.isArray(e.base) && e.base.every(Number.isInteger) ? e.base : placed.slice();
  }
  localKey = e.key;
  drawnAt = e.drawnAt || (isDone() ? e.at : null);
  $('question').value = rounds ? rounds.at(-1).question : e.question || '';
  $('impression').value = e.impression || '';
  renderBoard();
  renderFan();
  update();
  if (readingId) hydrate(readingId);
  if (isDone()) completed();
}

// What the journal holds about a saved reading resumed from this device, besides its cards:
// the interpretation, notes and earlier versions.
async function hydrate(id) {
  const g = gen;
  let r;
  try {
    r = await api(`readings/${id}`);
  } catch {
    return;
  }
  if (!isCurrent(g) || readingId !== id) return;
  interpretation = r.interpretation ? { text: r.interpretation, at: r.interpreted_at } : null;
  earlier = r.earlier || [];
  notes = r.notes || [];
  update();
  startPolling();
}

// Saves finished readings that were kept on this device while the journal was out of reach.
async function saveKeptReadings() {
  if (!server.on) return;
  let saved = 0;
  for (const { key } of localReadings()) {
    // Read again each time: one may have been discarded or opened while another saved.
    const e = localReadings().find(x => x.key === key);
    // A saved reading's change is sent when it is resumed, not posted as a new reading.
    if (!e || e.key === localKey || savingKeys.has(e.key) || !validEntry(e) || !entryDone(e) || e.readingId) continue;
    // The entry stays stored until the journal confirms it; only this page's claim hides it.
    claim(e.key);
    if (!$('pickerView').hidden) renderLocal();
    const dk = entryDeck(e);
    const s = findSpread(e.spread, dk);
    const at = e.drawnAt || e.at;
    const rev = e.reversed ?? null;
    const rs = s.session ? e.rounds : null;
    const question = rs ? joinQuestions(rs) : (e.question || '').trim();
    try {
      await api('readings', {
        method: 'POST',
        body: JSON.stringify({
          deck: dk.id, spread: e.spread, variant: e.variant, question,
          impression: (e.impression || '').trim(), cards: e.placed, reversed: rev, rounds: rs?.map(r => r.cards) ?? null, reshuffled: reshuffledOf(rs), created_at: localStamp(at),
          summary: readingText({ dk, spread: s, variant: e.variant, cards: e.placed, reversed: rev, rounds: rs, question, impression: e.impression, date: at }),
        }),
      });
      dropLocal(e.key);
      saved++;
    } catch {
      break;
    } finally {
      release(e.key);
    }
  }
  if (!$('pickerView').hidden) renderLocal();
  if (!saved) return;
  toast(saved === 1 ? 'A reading kept on this device was saved to your journal.' : `${saved} readings kept on this device were saved to your journal.`);
  if (location.hash === '#journal') showJournal(true);
}

function renderLocal() {
  const list = $('localList');
  list.replaceChildren();
  const entries = localReadings().filter(e => entryDeck(e) === D && validEntry(e) && !savingKeys.has(e.key));
  $('localBlock').hidden = !entries.length;
  entries.forEach(e => {
    const s = findSpread(e.spread);
    const total = s.session ? null : s.variants[e.variant].positions.length + (e.extra || 0);
    const li = document.createElement('li');
    li.innerHTML = `
      <button class="local-item">
        <span class="local-name"></span>
        <span class="local-state"></span>
        <span class="local-question"></span>
      </button>
      <button class="journal-delete" aria-label="Discard this reading"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>`;
    li.querySelector('.local-name').textContent = s.name + (s.variants.length > 1 ? ` · ${s.variants[e.variant].name}` : '');
    li.querySelector('.local-state').textContent = entryDone(e)
      ? `${e.readingId ? 'Journal not yet updated' : 'Not yet saved to journal'} · ${formatDate(e.drawnAt || e.at, { day: 'numeric', month: 'short' })}`
      : `Unfinished, ${e.placed.length}${total ? ` of ${total}` : ''} card${e.placed.length === 1 && !total ? '' : 's'} · Resume`;
    li.querySelector('.local-question').textContent = (e.question || '').trim().replace(/\n/g, ' · ');
    li.querySelector('.local-item').addEventListener('click', () => resumeLocal(e));
    li.querySelector('.journal-delete').addEventListener('click', () => {
      dropLocal(e.key);
      renderLocal();
      toast('Reading discarded.', { label: 'Undo', run: () => { storeLocal([e, ...localReadings()]); renderLocal(); } });
    });
    list.appendChild(li);
  });
}

// The last few spreads finished, newest first, for the home page's "Use again" row.
function recentSpreads() {
  try { return JSON.parse(localStorage.getItem('tarot-recent')) || []; } catch { return []; }
}

function rememberSpread() {
  const list = recentSpreads().filter(r => readingDeck(r) !== D || r.spread !== spread.id || r.variant !== variantIndex);
  list.unshift({ deck: D.id, spread: spread.id, variant: variantIndex });
  try { localStorage.setItem('tarot-recent', JSON.stringify(list.slice(0, 8))); } catch {}
}

function renderRecent() {
  const row = $('recentRow');
  row.replaceChildren();
  const recent = recentSpreads().filter(r => {
    const s = readingDeck(r) === D && findSpread(r.spread);
    return s && Number.isInteger(r.variant) && r.variant >= 0 && r.variant < s.variants.length;
  }).slice(0, 4);
  $('recentBlock').hidden = !recent.length;
  recent.forEach(r => {
    const s = findSpread(r.spread);
    const a = document.createElement('a');
    a.className = 'recent-tile';
    a.href = spreadHash(s, r.variant);
    const mini = document.createElement('div');
    mini.className = 'mini-board';
    layout(mini, s.variants[r.variant].positions);
    a.append(mini);
    a.insertAdjacentHTML('beforeend', '<span class="recent-text"><span class="tile-name"></span><span class="tile-count"></span></span>');
    a.querySelector('.tile-name').textContent = s.name;
    a.querySelector('.tile-count').textContent = s.session ? 'Three cards a question' : s.variants.length > 1 ? s.variants[r.variant].name : `${s.variants[r.variant].positions.length} card${s.variants[r.variant].positions.length > 1 ? 's' : ''}`;
    row.appendChild(a);
  });
}

// ---------- views ----------

function showView(name) {
  $('pickerView').hidden = name !== 'picker';
  $('readingView').hidden = name !== 'reading';
  $('journalView').hidden = name !== 'journal';
  if (name !== 'reading') stopPolling();
}

// ---------- reading ----------

// The question being drawn for has an empty place for each of its three cards; a clarifier
// gets its place only once it is in the air, so an empty place never suggests one.
function positions() {
  return spread.session
    ? sessionPositions(rounds, !finished && (rounds.at(-1).cards < 3 || flying))
    : spreadPositions(spread, variantIndex, extra);
}

// A fixed spread's positions, then `extra` clarifiers in a row under it, under a tag.
function spreadPositions(s, v, extra = 0) {
  const ps = s.variants[v].positions;
  if (!extra) return ps;
  const b = bounds(ps);
  const y = b.minY + b.h + 0.1 + TAG + 0.75;
  return [...ps, ...Array.from({ length: extra }, (_, k) => ({ ...P(`Clarifier ${k + 1}`, b.minX + 0.56 + k * 1.15, y), above: TAG }))];
}

// The positions of a reading's cards, clarifiers included.
function readingPositions(s, v, cards, rounds) {
  return rounds ? sessionPositions(rounds) : spreadPositions(s, v, Math.max(0, cards.length - s.variants[v].positions.length));
}

// One row per question: its three cards, then any clarifiers after a small gap, under a tag with the
// question's number. While the reading is open, the question being drawn for has one empty place more,
// where the next card lands. A question copied on its own carries its number in the sitting as `n`.
const ROW = 2.1, TAG = 0.45;
function sessionPositions(rs, open = false) {
  const ps = [];
  rs.forEach((r, ri) => {
    const n = r.cards + (open && ri === rs.length - 1 ? 1 : 0), q = r.n ?? ri + 1;
    for (let k = 0; k < n; k++) {
      ps.push({ ...P(k < 3 ? `Question ${q}, card ${k + 1}` : `Question ${q}, clarifier ${k - 2}`, k * 1.15 + (k < 3 ? 0 : 0.35), ri * ROW), above: TAG });
    }
  });
  return ps;
}

// Above each question's row on the board, and above a spread's clarifiers: a name, and a Copy
// button once the question has its three cards, or the first clarifier is drawn.
function renderRoundTags() {
  const board = $('board');
  board.querySelectorAll('.round-tag').forEach(t => t.remove());
  const ps = positions(), b = bounds(ps), base = spread.session ? 0 : spread.variants[variantIndex].positions.length;
  const tags = spread.session
    ? rounds.map((r, ri, rs) => ({ at: rs.slice(0, ri).reduce((t, x) => t + x.cards, 0), name: `Question ${ri + 1}`, ready: r.cards >= 3, copy: () => copyQuestion(ri) }))
    : extra ? [{ at: base, name: 'Clarifiers', ready: placed.length > base, copy: () => copyText(clarifierText(), 'Clarifiers copied.') }] : [];
  tags.forEach(t => {
    const p = ps[t.at];
    if (!p) return;
    const tag = document.createElement('div');
    tag.className = 'round-tag';
    tag.style.left = `${((p.x - 0.5 - b.minX) / b.w) * 100}%`;
    tag.style.top = `${((p.y - 0.75 - TAG - b.minY) / b.h) * 100}%`;
    tag.style.height = `${((TAG - 0.07) / b.h) * 100}%`;
    tag.innerHTML = '<span></span><button class="ghost">Copy</button>';
    tag.firstChild.textContent = t.name;
    tag.lastChild.hidden = !t.ready;
    tag.lastChild.setAttribute('aria-label', `Copy ${t.name.toLowerCase()}`);
    tag.lastChild.addEventListener('click', t.copy);
    board.appendChild(tag);
  });
}

// The board after it grew or shrank by a place: a question, a clarifier.
function growBoard() {
  // The board's children are its slots, one per position, before the tags go back on.
  $('board').querySelectorAll('.round-tag').forEach(t => t.remove());
  layout($('board'), positions(), true).forEach((slot, i) => {
    if (slot.dataset.index) return;
    slot.dataset.index = i;
    slot.classList.add('empty');
    slot.innerHTML = `<span class="slot-num">${i + 1}</span>`;
  });
}

function isParadox() {
  return spread?.ritual === 'paradox';
}

function setupSpread(s, variant) {
  spread = s;
  variantIndex = Math.min(variant, s.variants.length - 1);
  $('spreadName').textContent = s.name;
  $('spreadIntro').textContent = s.intro;
  const select = $('variantSelect');
  select.replaceChildren(...s.variants.map((v, i) => new Option(v.name || '', i)));
  select.value = variantIndex;
  $('variantField').hidden = s.variants.length < 2;
  showView('reading');
  window.scrollTo(0, 0);
}

function spreadHash(s = spread, v = variantIndex) {
  return v ? `#${s.id}/${v}` : `#${s.id}`;
}

function openSpread(id, variant = 0, question = '') {
  const s = findSpread(id);
  if (!s) return showHome();
  beginTransition();  // before anything about the old reading is replaced
  setupSpread(s, Number.isInteger(variant) && variant >= 0 ? variant : 0);
  $('question').value = question;
  newReading();
  track(`Spread: ${s.name}${D.id === 'osho' ? '' : ` (${D.title})`}`);
}

// Opens a finished reading from a link:
// #r?d=<deck>&s=<spread>&v=<variant>&c=<cards>&rv=<0 or 1 per card>&g=<cards per question>&q=<question>&id=<journal id>
// `d` is left out for the Osho Zen deck, `rv` when reversals were off, `g` but for the
// question-by-question spread (whose `q` holds every question, one line each).
function openSharedReading(params) {
  setDeck(DECKS[params.get('d')] ? params.get('d') : 'osho');
  const s = findSpread(params.get('s'));
  if (!s) return showHome();
  const v = Number(params.get('v') ?? 0);
  const cards = (params.get('c') || '').split('-').map(Number);
  if (!Number.isInteger(v) || v < 0 || v >= s.variants.length) return openSpread(s.id);
  const rs = s.session ? splitRounds((params.get('g') || '').split('-').map(Number), params.get('q'), (params.get('f') || '').split('-').filter(Boolean).map(Number)) : null;
  const valid = (s.session ? validRounds(rs, cards, true) : cards.length >= s.variants[v].positions.length) &&
    cards.every(n => Number.isInteger(n) && n >= 1 && n <= D.total) && distinctCards(rs, cards);
  if (!valid) return openSpread(s.id);
  const rv = params.get('rv');
  beginTransition();
  setupSpread(s, v);
  placed = cards;
  reversed = D.reversals && rv && rv.length === cards.length && /^[01]+$/.test(rv) ? [...rv].map(c => c === '1') : null;
  rounds = rs;
  finished = !!rs;
  extra = rs ? 0 : cards.length - s.variants[v].positions.length;
  deck = shuffle(allCards().filter(n => !sinceWhole(rs, cards).includes(n)));
  cutDone = true;
  fanMode = 'fan';
  $('question').value = rs ? rs.at(-1).question : params.get('q') || '';
  $('impression').value = '';
  resetJournalState();
  localKey = null;
  drawnAt = null;
  readingId = params.get('id');
  verified = !readingId;
  setReadOnly(!verified);
  renderBoard();
  renderFan();
  update();
  if (readingId && server.on) loadReading(readingId);
  else if (readingId) { readingId = null; verified = true; setReadOnly(false); update(); }
}

function showHome() {
  beginTransition();
  spread = null;
  showView('picker');
  renderLocal();
  renderRecent();
}

// Clears what belongs to a journal entry, before another reading takes the screen.
function resetJournalState() {
  readingId = null;
  base = null;
  interpretation = null;
  notes = [];
  earlier = [];
  ownReading = false;
  verified = true;
  setReadOnly(false);
}

function setReadOnly(on) {
  $('question').readOnly = on;
  $('impression').readOnly = on;
}

function newReading() {
  beginTransition();
  deck = shuffle(allCards());
  placed = [];
  reversed = null;
  rounds = spread.session ? [{ question: $('question').value, cards: 0 }] : null;
  finished = false;
  extra = 0;
  fanMode = 'fan';
  cutDone = false;
  resetJournalState();
  localKey = newKey();
  drawnAt = null;
  $('impression').value = '';
  renderBoard();
  renderFan();
  update();
  play('fan');
}

function renderBoard() {
  const slots = layout($('board'), positions());
  slots.forEach((slot, i) => {
    slot.dataset.index = i;
    if (placed[i]) {
      fillSlot(slot, placed[i], false, isRev(i));
    } else {
      slot.classList.add('empty');
      slot.innerHTML = `<span class="slot-num">${i + 1}</span>`;
    }
  });
}

function slotAt(i) {
  return $('board').querySelector(`.slot[data-index="${i}"]`);
}

function fillSlot(slot, n, animate, rev) {
  slot.classList.remove('empty', 'next');
  slot.innerHTML = `
    <button class="card3d${rev ? ' reversed' : ''}" aria-label="${cardName(n)}${rev ? ', reversed' : ''}">
      <span class="face back"></span>
      <span class="face front"><img src="${cardThumb(n)}" alt=""></span>
    </button>`;
  const card = slot.querySelector('.card3d');
  card.addEventListener('click', () => openCard(n, Number(slot.dataset.index)));
  if (animate) {
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('flipped')));
  } else {
    card.classList.add('flipped');
  }
}

function isDone() {
  return spread.session ? finished : placed.length >= positions().length;
}

// A finished reading drawn here that the journal does not have yet.
function waitingForJournal() {
  return isDone() && !readingId && !!localKey && journalOrigin && !saving;
}

function statusText() {
  const ps = positions();
  if (isDone()) {
    if (readingId) return 'The spread is complete and saved to your journal.';
    if (saving) return 'The spread is complete. Saving it to your journal…';
    if (waitingForJournal()) return 'The spread is complete. Not yet saved to journal.';
    if (saveFailed) return 'The spread is complete, but it could not be saved to the journal.';
    return 'The spread is complete.';
  }
  if (fanMode === 'piles') return 'Choose one of the three packs.';
  if (isParadox() && !cutDone) return 'Shuffle for as long as you like, then cut the deck and choose a pack.';
  if (spread.session) {
    const q = rounds.length, have = rounds[q - 1].cards;
    const now = have < 3
      ? `Question ${q}, card ${have + 1} of 3.`
      : `Question ${q} has its three cards. Draw a clarifier if they need one, or go on to the next question, or finish.`;
    return placed.length === 0 && !cutDone ? `Write your question, then draw. ${now} Shuffle or cut first if you like.` : now;
  }
  const next = `Card ${placed.length + 1} of ${ps.length}: ${ps[placed.length].label}`;
  return placed.length === 0 && !cutDone ? `${next}. Shuffle or cut first if you like.` : next;
}

function update() {
  const ps = positions();
  const done = isDone();
  $('board').querySelectorAll('.slot').forEach(s => s.classList.remove('next'));
  if (!done) slotAt(placed.length)?.classList.add('next');

  $('status').textContent = statusText();
  $('fan').classList.toggle('closed', done);
  $('fan').inert = done;
  $('deckControls').hidden = done || (placed.length > 0 && !betweenQuestions()) || fanMode === 'piles' || (isParadox() && cutDone);
  $('resetDeckButton').hidden = !betweenQuestions() || rounds.length < 2 || deck.length === D.total;
  renderReversalsButton();
  // A question gets its three cards before the next question or the end. A complete reading
  // can always be taken up again: a sitting for more questions, a spread for a clarifier.
  $('sessionControls').hidden = flying || (done ? saving || !verified : !spread.session || rounds.at(-1).cards < 3);
  $('nextQuestionButton').hidden = $('finishButton').hidden = done;
  $('continueButton').hidden = !done;
  $('continueButton').textContent = spread.session ? 'Continue the sitting' : 'Draw a clarifier';
  $('questionLabel').textContent = spread.session ? `Question ${rounds.length}` : 'Your question';
  $('question').placeholder = spread.session && rounds.length > 1 ? 'The next question' : 'What would you like to look at?';

  const list = $('positions');
  list.replaceChildren();
  // Where each question starts, for a heading with its words above its cards.
  const starts = new Map();
  if (spread.session) rounds.reduce((at, r, ri) => (starts.set(at, ri), at + r.cards), 0);
  ps.forEach((p, i) => {
    if (starts.has(i)) {
      const head = document.createElement('li');
      head.className = 'round-head';
      const ri = starts.get(i);
      const words = (ri === rounds.length - 1 ? $('question').value : rounds[ri].question).trim();
      head.innerHTML = '<span></span><button class="ghost">Copy</button>';
      head.firstChild.textContent = `Question ${ri + 1}${words ? `: ${words}` : ''}`;
      head.lastChild.hidden = rounds[ri].cards < 3;
      head.lastChild.setAttribute('aria-label', `Copy question ${ri + 1}`);
      head.lastChild.addEventListener('click', () => copyQuestion(ri));
      list.appendChild(head);
    }
    const li = document.createElement('li');
    const n = placed[i];
    li.className = n ? 'filled' : i === placed.length ? 'next' : '';
    li.innerHTML = '<span class="pos-num"></span><span class="pos-text"><span class="pos-label"></span><span class="pos-card"></span></span>';
    li.querySelector('.pos-num').textContent = i + 1;
    li.querySelector('.pos-label').textContent = p.label;
    li.querySelector('.pos-card').textContent = n ? cardName(n) + (isRev(i) ? ', reversed' : '') : '';
    if (n) li.addEventListener('click', () => openCard(n, i));
    list.appendChild(li);
  });

  renderRoundTags();
  $('impressionField').hidden = !done;
  $('copyButton').disabled = !done && !(spread.session && completeRounds() > 0);
  $('linkButton').disabled = !done;
  $('undoButton').disabled = !canUndo() || (isParadox() && placed.length <= 2);
  history.replaceState(null, '', done ? `#${shareHash()}` : spreadHash());
  keepLocal();
  renderSaved();
  renderInterpretation();
  renderNotes();
}

// ---------- the fan ----------

function renderFan() {
  const fan = $('fan');
  fan.replaceChildren();
  deck.forEach(n => {
    const c = document.createElement('button');
    c.className = 'fan-card';
    c.dataset.card = n;
    c.setAttribute('aria-label', 'Face-down card');
    c.addEventListener('click', () => onFanClick(c));
    fan.appendChild(c);
  });
  layoutFan();
}

function fanMetrics() {
  const fan = $('fan');
  const W = fan.clientWidth;
  const cw = Math.max(46, Math.min(84, W / 8));
  return { fan, W, cw, ch: cw * 1.5, depth: cw * 0.4 };
}

function layoutFan() {
  const { fan, W, cw, ch, depth } = fanMetrics();
  const cards = [...fan.children];
  const n = cards.length;
  fan.style.height = `${ch + depth + 24}px`;
  if (fanMode === 'piles') return layoutPiles(cards, W, cw, ch);
  const step = n > 1 ? Math.min(cw * 0.6, (W - cw) / (n - 1)) : 0;
  const offset = (W - (step * (n - 1) + cw)) / 2;
  const spreadDeg = Math.min(26, n * 0.6);
  cards.forEach((c, i) => {
    const t = n > 1 ? i / (n - 1) - 0.5 : 0;
    const x = offset + i * step;
    const y = 20 + 4 * t * t * depth;
    const rot = t * spreadDeg;
    c.style.width = `${cw}px`;
    c.style.height = `${ch}px`;
    c.style.zIndex = i;
    c.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)`;
    c.dataset.rot = rot;
  });
}

function pileOf(i, n) {
  return Math.min(2, Math.floor((i * 3) / n));
}

function layoutPiles(cards, W, cw) {
  const n = cards.length;
  cards.forEach((c, i) => {
    const pile = pileOf(i, n);
    const depthInPile = i - Math.ceil((pile * n) / 3);
    const x = W * (0.2 + pile * 0.3) - cw / 2 + depthInPile * 0.35;
    const y = 20 - depthInPile * 0.35;
    c.style.width = `${cw}px`;
    c.style.height = `${cw * 1.5}px`;
    c.style.transform = `translate(${x}px, ${y}px) rotate(0deg)`;
    c.dataset.rot = 0;
    c.dataset.pile = pile;
  });
}

function onFanClick(cardEl) {
  if (flying || isDone()) return;
  if (fanMode === 'piles') return choosePile(Number(cardEl.dataset.pile));
  if (isParadox() && !cutDone) return toast('First cut the deck and choose a pack.');
  pick(cardEl);
}

// Gathers the fan to the middle, reshuffles, and spreads it out again.
// Question by question: a new question's first card is not drawn yet, so the deck may be
// shuffled, cut or made whole again.
const betweenQuestions = () => !!spread?.session && !finished && rounds.at(-1).cards === 0;

function shuffleDeck() {
  if (flying || (placed.length && !betweenQuestions())) return;
  const { fan, W, cw } = fanMetrics();
  const cards = [...fan.children];
  fanMode = 'fan';
  play('shuffle');
  flying = true;
  cards.forEach(c => {
    c.style.transform = `translate(${W / 2 - cw / 2 + (Math.random() - 0.5) * 30}px, 20px) rotate(${(Math.random() - 0.5) * 16}deg)`;
  });
  // The cards stay gathered for the length of the riffle, then fan out again.
  const g = gen;
  setTimeout(() => {
    if (!isCurrent(g)) return;
    deck = shuffle(deck);
    cards.forEach((c, i) => { c.dataset.card = deck[i]; });
    layoutFan();
    play('fan');
    flying = false;
    update();
  }, reducedMotion.matches ? 0 : 850);
}

function cutDeck() {
  if (flying || (placed.length && !betweenQuestions())) return;
  fanMode = 'piles';
  play('cut');
  layoutFan();
  update();
}

// Puts the chosen pack on top. For the Paradox, its top and bottom cards become
// positions 1 and 2, and only the rest of that pack stays in the fan.
async function choosePile(pile) {
  const cards = [...$('fan').children];
  const n = cards.length;
  const inPile = cards.filter((_, i) => pileOf(i, n) === pile);
  cutDone = true;
  play('cut');

  if (isParadox()) {
    const g = gen;
    flying = true;
    const [top, bottom] = [inPile[inPile.length - 1], inPile[0]];
    cards.filter(c => !inPile.includes(c)).forEach(c => c.classList.add('leaving'));
    await place(top);
    if (!isCurrent(g)) return;
    await place(bottom);
    if (!isCurrent(g)) return;
    cards.filter(c => !inPile.includes(c)).forEach(c => c.remove());
    deck = [...$('fan').children].map(c => Number(c.dataset.card));
    fanMode = 'fan';
    flying = false;
    layoutFan();
    update();
    return;
  }

  const order = [...inPile, ...cards.filter(c => !inPile.includes(c))];
  $('fan').replaceChildren(...order);
  deck = order.map(c => Number(c.dataset.card));
  fanMode = 'fan';
  layoutFan();
  update();
}

function pick(cardEl) {
  if (flying || isDone()) return;
  const g = gen;
  flying = true;
  if (spread.session) growBoard();  // a clarifier's place
  place(cardEl).then(() => {
    if (!isCurrent(g)) return;
    flying = false;
    if (spread.session) growBoard();
    if (isDone()) return completed();
    update();
  });
}

// The reading is complete, the first time or again after more cards: saved to the journal,
// or the saved copy updated.
function completed() {
  drawnAt ??= new Date().toISOString();
  rememberSpread();
  update();
  if (readingId) saveCards();
  else saveReading();
}

// Flies a card from the fan to the next empty position and flips it there.
function place(cardEl) {
  const g = gen;
  const n = Number(cardEl.dataset.card);
  const index = placed.length;
  const slot = slotAt(index);
  play('slide');
  deck = deck.filter(c => c !== n);
  placed.push(n);
  if (rounds) rounds[rounds.length - 1].cards++;
  // Whether reversals are in play is settled by the first card, so the reading keeps it.
  if (index === 0) reversed = D.reversals && reversals ? [] : null;
  const rev = !!reversed && randomInt(2) === 1;
  if (reversed) reversed.push(rev);
  new Image().src = cardThumb(n);

  if (reducedMotion.matches) {
    cardEl.remove();
    fillSlot(slot, n, false, rev);
    layoutFan();
    return Promise.resolve();
  }

  const from = cardEl.getBoundingClientRect();
  const to = slot.getBoundingClientRect();
  const fromW = cardEl.offsetWidth, fromH = cardEl.offsetHeight;
  const toRot = positions()[index].rot || 0;
  const flyer = document.createElement('div');
  flyer.className = 'flyer';
  flyer.style.width = `${fromW}px`;
  flyer.style.height = `${fromH}px`;
  flyer.style.left = `${from.left + from.width / 2 - fromW / 2}px`;
  flyer.style.top = `${from.top + from.height / 2 - fromH / 2}px`;
  flyer.style.transform = `rotate(${cardEl.dataset.rot}deg)`;
  document.body.appendChild(flyer);
  cardEl.remove();
  if (fanMode === 'fan') layoutFan();

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const scale = slot.offsetWidth / fromW;
  requestAnimationFrame(() => {
    flyer.style.transform = `translate(${dx}px, ${dy}px) rotate(${toRot}deg) scale(${scale})`;
  });

  return new Promise(resolve => {
    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      flyer.remove();
      if (isCurrent(g)) {
        play('place');
        fillSlot(slot, n, true, rev);
      }
      resolve();
    };
    flyer.addEventListener('transitionend', land, { once: true });
    setTimeout(land, 900);
  });
}

// Once Claude or Batu has written about the saved reading, its cards are final: more can be
// added, but undo only takes back what was added. Checked on every undo, since an
// interpretation can arrive while cards are being added.
const cardsLocked = () => !!interpretation || notes.length > 0 || addingNote || (!!readingId && !ownReading);
const undoFloor = () => (readingId && cardsLocked() ? (base ?? placed).length : 0);

// A question asked but not drawn for yet, or a clarifier asked for but not drawn yet.
const emptyPlace = () => spread.session
  ? !finished && rounds.length > 1 && rounds.at(-1).cards === 0
  : extra > 0 && placed.length < positions().length;

function canUndo() {
  return !!spread && !flying && (emptyPlace() || placed.length > undoFloor());
}

// The save in flight is called off.
function unsave() {
  if (pendingSave) pendingSave.cancelled = true;
  pendingSave = null;
  gen++;
  saving = false;
  saveFailed = false;
  clearTimeout(questionTimer);
  questionTimer = null;
}

// A saved reading stays in the journal while it changes, and is updated once it is complete again.
function undo() {
  if (!canUndo()) return;
  if (readingId) {
    base ??= placed.slice();
    localKey ??= newKey();  // kept on this device until the journal has the change
    flushQuestion();
  } else {
    unsave();
  }
  // A question asked but not yet drawn for goes first, giving back the one before it; a
  // clarifier's empty place, giving back the complete spread.
  if (emptyPlace()) {
    if (spread.session) {
      // A deck made whole for that question goes back to what was left of it.
      if (rounds.pop().fresh) {
        deck = shuffle(allCards().filter(n => !sinceWhole(rounds, placed).includes(n)));
        renderFan();
      }
      $('question').value = rounds.at(-1).question;
    } else {
      extra--;
    }
    growBoard();
    if (isDone()) return completed();
    update();
    return;
  }
  if (rounds) rounds[rounds.length - 1].cards--;
  finished = false;
  const n = placed.pop();
  reversed?.pop();
  if (!placed.length) reversed = null;
  deck.splice(randomInt(deck.length + 1), 0, n);
  if (!readingId) drawnAt = null;
  renderBoard();
  renderFan();
  update();
}

// ---------- question by question ----------

function nextQuestion() {
  if (!spread?.session || finished || flying || rounds.at(-1).cards < 3) return;
  rounds.push({ question: '', cards: 0 });
  $('question').value = '';
  growBoard();
  update();
  $('question').focus();
}

// Before a question's first card: the cards drawn so far go back and the deck is shuffled
// whole, so a card may come up again in this question or a later one.
function resetDeck() {
  if (flying || !betweenQuestions() || rounds.length < 2) return;
  rounds.at(-1).fresh = true;
  deck = shuffle(allCards());
  fanMode = 'fan';
  renderFan();
  update();
  play('shuffle');
  toast('The deck is whole again and shuffled.');
}

function finishSession() {
  if (!spread?.session || finished || flying || rounds.at(-1).cards < 3) return;
  finished = true;
  growBoard();
  completed();
}

// A complete reading taken up again, also one opened from the journal: a sitting for a
// clarifier or a next question, a spread for a clarifier.
function reopen() {
  if (!spread || !isDone() || flying || saving || !verified) return;
  if (readingId) {
    base ??= placed.slice();
    localKey ??= newKey();  // kept on this device until the journal has the change
    flushQuestion();
  }
  if (spread.session) finished = false;
  else extra++;
  growBoard();
  update();
}

function changeVariant() {
  if (flying) {
    $('variantSelect').value = variantIndex;  // a card is in the air; finish placing it first
    return;
  }
  flushQuestion();
  const before = positions().length;
  variantIndex = Number($('variantSelect').value);
  if (positions().length !== before || readingId || saving) {
    newReading();
  } else {
    renderBoard();
    update();
  }
}

// ---------- links ----------

function shareHash() {
  const p = new URLSearchParams({ ...(D.id !== 'osho' && { d: D.id }), s: spread.id, v: variantIndex, c: placed.join('-') });
  if (reversed) p.set('rv', reversed.map(Number).join(''));
  if (rounds) p.set('g', rounds.map(r => r.cards).join('-'));
  if (reshuffledOf(rounds).length) p.set('f', reshuffledOf(rounds).join('-'));
  const q = ownWords().question;
  if (q) p.set('q', q);
  if (readingId) p.set('id', readingId);
  return `r?${p}`;
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast(message);
}

// ---------- the journal (server only) ----------

async function api(path, options = {}) {
  const res = await fetch(`api/${path}`, {
    ...options,
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.status === 204 ? null : res.json();
}

async function detectServer() {
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch('api/health', { signal: ctrl.signal, cache: 'no-store' });
    const health = res.ok ? await res.json() : {};
    server.on = health.ok === true;
    server.jev = server.on && health.jev === true;
  } catch {
    server.on = server.jev = false;
  }
  $('askJev').hidden = !server.jev;
  if (server.on && !journalOrigin) {
    journalOrigin = true;
    try { localStorage.setItem('tarot-journal', 'yes'); } catch {}
  }
  $('journalLink').hidden = !server.on;
}

// ---------- asking Jev which spread (server only) ----------

// Jev returns a probability for every spread of the deck in use; the likely ones are
// listed, and opening one from the list takes the question along into the reading.
let askGen = 0;
let carriedQuestion = '';

function clearAsk() {
  askGen++;
  $('askResult').replaceChildren();
  $('askSubmit').disabled = false;
}

async function askJev(event) {
  event.preventDefault();
  const question = $('askQuestion').value.trim();
  if (!question) return $('askQuestion').focus();
  const list = spreadsOf();
  const g = ++askGen;
  $('askSubmit').disabled = true;
  $('askResult').replaceChildren(Object.assign(document.createElement('li'), { className: 'ask-status', textContent: 'Asking Jev…' }));
  let r;
  try {
    r = await api('recommend', {
      method: 'POST',
      body: JSON.stringify({
        question, deck: D.title,
        spreads: Object.fromEntries(list.map(s => [s.id, [s.name, ...(s.hint || [])].join(' ')])),
      }),
    });
  } catch {
    if (g !== askGen) return;
    clearAsk();
    toast('Jev did not answer.', { label: 'Retry', run: () => $('askJev').requestSubmit() });
    return;
  }
  if (g !== askGen) return;
  $('askSubmit').disabled = false;
  const ranked = list.map(s => ({ s, p: r.probabilities[s.id] || 0 })).sort((a, b) => b.p - a.p);
  // Spreads under 5% are left out, but the top one is always shown.
  const shown = ranked.filter((x, i) => i === 0 || x.p >= 0.05);
  $('askResult').replaceChildren(...shown.map(({ s, p }) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#${s.id}`;
    a.style.setProperty('--p', p);
    a.innerHTML = '<span class="ask-name"></span><span class="ask-score"></span>';
    a.firstChild.textContent = s.name;
    a.lastChild.textContent = `${Math.round(p * 100)}%`;
    a.addEventListener('click', () => { carriedQuestion = question; });
    li.appendChild(a);
    return li;
  }));
}

async function saveReading() {
  if (!server.on || !spread || readingId || saving || !isDone()) return;
  const g = gen;
  const words = ownWords();
  const key = localKey;
  const job = { cancelled: false, final: null };
  pendingSave = job;
  saving = true;
  saveFailed = false;
  update();
  if (key) claim(key);
  let r;
  try {
    r = await api('readings', {
      method: 'POST',
      body: JSON.stringify({
        deck: D.id, spread: spread.id, variant: variantIndex, ...words, cards: placed, reversed,
        rounds: rounds?.map(r => r.cards) ?? null, reshuffled: reshuffledOf(rounds), summary: readingText(),
        ...(drawnAt && { created_at: localStamp(drawnAt) }),
      }),
    });
  } catch {
    if (key) release(key);
    if (pendingSave === job) pendingSave = null;
    if (!isCurrent(g)) {
      if (!$('pickerView').hidden) renderLocal();
      return;
    }
    saving = false;
    saveFailed = true;
    update();
    toast('Could not save to the journal.', { label: 'Retry', run: () => { if (isCurrent(g)) saveReading(); } });
    return;
  }
  if (pendingSave === job) pendingSave = null;
  if (key) release(key);
  // Undone while saving: the row describes a reading that no longer exists. Try twice,
  // since a lost delete would leave a stray entry in the journal.
  if (job.cancelled) {
    const del = () => api(`readings/${r.id}`, { method: 'DELETE' });
    return del().catch(() => setTimeout(() => del().catch(() => {}), 3000));
  }
  if (key) dropLocal(key);
  // Left for another view while saving: the reading stays in the journal, with the
  // question and impression as they were when it was left.
  if (!isCurrent(g)) {
    const changed = job.final && (job.final.question !== words.question || job.final.impression !== words.impression);
    const update = changed
      ? api(`readings/${r.id}`, { method: 'PATCH', body: JSON.stringify(job.final) }).catch(() => {})
      : Promise.resolve();
    // If the journal is what was opened meanwhile, it loaded before this entry existed.
    update.then(() => { if (location.hash === '#journal') showJournal(true); });
    return;
  }
  saving = false;
  readingId = r.id;
  ownReading = true;
  const now = ownWords();
  if (now.question !== words.question || now.impression !== words.impression) sendEdits();
  update();
  startPolling();
}

// A saved reading that got more cards, or fewer, after it was taken up again. `base` tells
// the journal which cards this change starts from, so a change made meanwhile in another tab
// or on another device is not overwritten; until the journal takes it, the change stays kept
// on this device.
function saveCards() {
  const id = readingId, from = base, cards = placed.slice();
  if (!from) return;
  const body = JSON.stringify({
    ...ownWords(), cards, reversed, rounds: rounds?.map(r => r.cards) ?? null, reshuffled: reshuffledOf(rounds), summary: readingText(), base: from,
  });
  questionChain = questionChain
    .then(() => api(`readings/${id}`, { method: 'PATCH', body }))
    .then(() => {
      if (readingId !== id || base !== from) return;
      // Changed again while this was on its way: the next save starts from what the journal has now.
      base = isDone() && placed.join('-') === cards.join('-') ? null : cards;
      update();
      if (!base) toast('Journal updated.');
    })
    .catch(err => {
      if (String(err.message).startsWith('409')) {
        toast('The journal copy was changed meanwhile, in another tab or on another device. These cards are kept on this device and were not saved.');
      } else {
        toast('Could not update the journal.', { label: 'Retry', run: () => { if (readingId === id && isDone()) saveCards(); } });
      }
    });
}

// The question and the first impression; both are saved the same way.
let questionTimer = null;
function onWordsInput() {
  if (spread?.session) rounds[rounds.length - 1].question = $('question').value;
  if (isDone()) history.replaceState(null, '', `#${shareHash()}`);
  keepLocal();
  if (!readingId || !verified) return;  // a save in progress picks the new words up when it lands
  clearTimeout(questionTimer);
  const g = gen, id = readingId;
  questionTimer = setTimeout(() => {
    questionTimer = null;
    if (isCurrent(g) && readingId === id) sendEdits();
  }, 700);
}

// Edits go out one at a time, so a slow earlier one can never land after a later one
// and overwrite it.
let questionChain = Promise.resolve();
function sendEdits() {
  // A saved reading being added to sends its words with its cards, once it is complete.
  if (!readingId || !verified || !isDone() || base) return;
  let body;
  try {
    body = JSON.stringify({ ...ownWords(), summary: readingText() });
  } catch {
    return;  // only reachable if the reading is incomplete; nothing sensible to send
  }
  const id = readingId;
  questionChain = questionChain
    .then(() => api(`readings/${id}`, { method: 'PATCH', body }))
    .catch(() => toast('Could not save your words to the journal.'));
}

async function loadReading(id) {
  const g = gen;
  let r;
  try {
    r = await api(`readings/${id}`);
  } catch {
    if (!isCurrent(g) || readingId !== id) return;
    readingId = null;
    verified = true;
    setReadOnly(false);
    update();
    return;
  }
  if (!isCurrent(g) || readingId !== id) return;
  verified = true;
  setReadOnly(false);
  // A link whose cards were edited by hand must not pass for the saved reading.
  if (readingDeck(r) !== D || r.spread !== spread.id || r.variant !== variantIndex || r.cards.join('-') !== placed.join('-') ||
      JSON.stringify(r.reversed ?? null) !== JSON.stringify(reversed) ||
      JSON.stringify(r.rounds ?? null) !== JSON.stringify(rounds?.map(x => x.cards) ?? null) ||
      JSON.stringify(r.reshuffled ?? []) !== JSON.stringify(reshuffledOf(rounds))) {
    const link = readingLink(r);
    history.replaceState(null, '', link);
    return openSharedReading(new URLSearchParams(link.slice(3)));
  }
  if (rounds) rounds = splitRounds(r.rounds, r.question, r.reshuffled);
  $('question').value = rounds ? rounds.at(-1).question : r.question;
  $('impression').value = r.impression || '';
  drawnAt = r.created_at;
  interpretation = r.interpretation ? { text: r.interpretation, at: r.interpreted_at } : null;
  earlier = r.earlier || [];
  notes = r.notes || [];
  update();
  startPolling();
}

// While a saved reading is on screen, check every few seconds for an interpretation, or
// for a revised one after a follow-up.
function startPolling() {
  stopPolling();
  const g = gen, id = readingId;
  let inFlight = false;
  pollTimer = setInterval(async () => {
    if (!isCurrent(g) || readingId !== id) return stopPolling();
    if (document.visibilityState !== 'visible' || inFlight) return;
    inFlight = true;
    let r;
    try { r = await api(`readings/${id}/interpretation`); } catch { return; } finally { inFlight = false; }
    if (!isCurrent(g) || readingId !== id || !r.interpretation) return;
    if (interpretation && interpretation.at === r.interpreted_at && interpretation.text === r.interpretation) return;
    const first = !interpretation;
    interpretation = { text: r.interpretation, at: r.interpreted_at };
    earlier = r.earlier || [];
    update();
    toast(first ? "Claude's interpretation has arrived." : 'The interpretation was updated.');
    if (first) $('interpretation').scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  }, 5000);
}

function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
}

function renderSaved() {
  const note = $('savedNote');
  const waiting = waitingForJournal();
  note.hidden = !readingId && !waiting;
  note.classList.toggle('waiting', waiting);
  if (readingId) note.textContent = interpretation ? 'Saved in your journal.' : 'Saved in your journal. Ask Claude to interpret your latest reading, and it appears here.';
  else if (waiting) note.textContent = 'Not yet saved to journal. It stays on this device and is saved once the journal can be reached.';
}

function renderInterpretation() {
  const box = $('interpretation');
  box.hidden = !interpretation;
  if (!interpretation) return;
  $('interpretationMeta').textContent = `Claude · ${formatDate(interpretation.at)}`;
  $('interpretationText').innerHTML = renderMarkdown(interpretation.text);
  // Rebuilt only when it changes, so an open "Earlier version" stays open.
  const versions = $('earlierVersions');
  const key = JSON.stringify([readingId, earlier]);
  if (versions.dataset.key === key) return;
  versions.dataset.key = key;
  versions.replaceChildren(...earlier.map(e => {
    const d = document.createElement('details');
    d.className = 'earlier';
    d.innerHTML = '<summary></summary><div class="earlier-text"></div>';
    d.querySelector('summary').textContent = `Earlier version · ${formatDate(e.interpreted_at)}`;
    d.querySelector('.earlier-text').innerHTML = renderMarkdown(e.text);
    return d;
  }));
}

// ---------- coming back to a reading ----------

let notePrompt = '';
let addingNote = false;

function setNotePrompt(prompt) {
  notePrompt = prompt;
  document.querySelectorAll('#notePrompts .chip').forEach(c => c.setAttribute('aria-pressed', String(c.textContent === prompt)));
  $('noteText').placeholder = prompt || 'A note for today';
}

function renderNotes() {
  $('notes').hidden = !readingId || !server.on;
  if ($('notes').hidden) return;
  const list = $('noteList');
  list.replaceChildren(...notes.map(n => {
    const li = document.createElement('li');
    li.innerHTML = `
      <p class="note-meta"></p>
      <p class="note-text"></p>
      <button class="journal-delete" aria-label="Delete this note"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>`;
    li.querySelector('.note-meta').textContent = formatDate(n.created_at) + (n.prompt ? ` · ${n.prompt}` : '');
    li.querySelector('.note-text').textContent = n.text;
    li.querySelector('.journal-delete').addEventListener('click', () => deleteNote(n));
    return li;
  }));
}

async function addNote() {
  const text = $('noteText').value.trim();
  if (!text || !readingId) return;
  const g = gen, id = readingId, prompt = notePrompt;
  $('noteSave').disabled = true;
  addingNote = true;
  update();
  try {
    const n = await api(`readings/${id}/notes`, { method: 'POST', body: JSON.stringify({ prompt, text }) });
    if (!isCurrent(g) || readingId !== id) return;
    notes.push(n);
    // Only what was sent is cleared; anything written while it saved stays.
    if ($('noteText').value.trim() === text) {
      $('noteText').value = '';
      if (notePrompt === prompt) setNotePrompt('');
    }
  } catch {
    if (isCurrent(g)) toast('Could not save the note.');
  } finally {
    addingNote = false;
    $('noteSave').disabled = false;
    if (isCurrent(g)) update();
  }
}

async function deleteNote(n) {
  const g = gen, id = readingId;
  try {
    await api(`readings/${id}/notes/${n.id}`, { method: 'DELETE' });
  } catch {
    return toast('Could not delete the note.');
  }
  if (!isCurrent(g) || readingId !== id) return;
  notes = notes.filter(x => x !== n);
  renderNotes();
  toast('Note deleted.', {
    label: 'Undo',
    run: async () => {
      let back;
      try {
        back = await api(`readings/${id}/notes`, { method: 'POST', body: JSON.stringify(n) });
      } catch {
        return toast('Could not restore the note.');
      }
      if (!isCurrent(g) || readingId !== id) return;
      notes = [...notes, back].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id - b.id));
      renderNotes();
    },
  });
}

// `refresh` keeps the scroll position, for reloading the list in place after a delete.
async function showJournal(refresh = false) {
  if (!server.on) return showHome();
  beginTransition();
  const g = gen;
  spread = null;
  showView('journal');
  if (!refresh) {
    window.scrollTo(0, 0);
    // What is on screen may be another deck's journal: nothing of it stays usable while loading.
    journalReadings = [];
    selectedCard = null;
    $('journalSearch').value = '';
    $('journalList').replaceChildren();
    $('searchCount').hidden = $('recurringBlock').hidden = $('suitsBlock').hidden = true;
  }
  $('journalSummary').textContent = 'Loading…';
  let readings;
  try {
    readings = await api('readings');
  } catch {
    if (isCurrent(g)) $('journalSummary').textContent = 'The journal could not be loaded.';
    return;
  }
  if (!isCurrent(g)) return;
  // Each deck keeps its own journal.
  journalReadings = readings.filter(r => readingDeck(r) === D);
  readings = journalReadings;
  if (!refresh) {
    $('journalSearch').value = '';
    selectedCard = null;
  }
  renderJournalSummary(readings);
  renderRecurring(readings);
  renderJournalList();
  renderSuits(readings);
}

let journalReadings = [];
let selectedCard = null;  // the recurring card whose readings are listed

// Case and accents are ignored, Turkish dotless i included, so "isik" finds "Işık".
function fold(text) {
  return text.toLocaleLowerCase('tr').normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i');
}

// What a search looks through, the question first.
function searchable(r) {
  return [
    r.question,
    r.impression,
    ...(r.notes || []).flatMap(n => [n.prompt, n.text]),
    r.interpretation,
    ...(r.earlier || []).map(e => e.text),
  ].filter(Boolean);
}

// A short piece of text around the first match, for matches outside the question.
function excerpt(text, term) {
  const at = fold(text).indexOf(term);
  const start = Math.max(0, at - 40);
  const piece = text.slice(start, at + term.length + 80).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${piece}${at + term.length + 80 < text.length ? '…' : ''}`;
}

function renderJournalSummary(readings) {
  const drawn = readings.flatMap(r => r.cards);
  if (!readings.length) {
    $('journalSummary').textContent = 'No readings yet. Finished readings are saved here automatically.';
    return;
  }
  const first = readings[readings.length - 1].created_at;
  $('journalSummary').textContent =
    `${readings.length} reading${readings.length > 1 ? 's' : ''}, ${drawn.length} cards drawn since ${formatDate(first)}.`;
}

function readingLink(r) {
  const p = new URLSearchParams({ ...(r.deck && r.deck !== 'osho' && { d: r.deck }), s: r.spread, v: r.variant, c: r.cards.join('-') });
  if (r.reversed) p.set('rv', r.reversed.map(Number).join(''));
  if (r.rounds) p.set('g', r.rounds.join('-'));
  if (r.reshuffled?.length) p.set('f', r.reshuffled.join('-'));
  if (r.question) p.set('q', r.question);
  p.set('id', r.id);
  return `#r?${p}`;
}

function renderJournalList() {
  const list = $('journalList');
  list.replaceChildren();
  const term = fold($('journalSearch').value.trim());
  const readings = term
    ? journalReadings.filter(r => searchable(r).some(t => fold(t).includes(term)))
    : journalReadings;
  $('searchCount').hidden = !term;
  $('searchCount').textContent = `${readings.length} of ${journalReadings.length} readings`;
  readings.forEach(r => {
    const s = findSpread(r.spread);
    const li = document.createElement('li');
    li.innerHTML = `
      <a class="journal-item">
        <span class="journal-meta"><span class="journal-date"></span><span class="journal-spread"></span></span>
        <span class="journal-question"></span>
        <span class="journal-cards"></span>
        <span class="journal-match" hidden></span>
      </a>
      <button class="journal-delete" aria-label="Delete this reading"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>`;
    li.querySelector('a').href = readingLink(r);
    li.querySelector('.journal-date').textContent = formatDate(r.created_at, { day: 'numeric', month: 'short', year: 'numeric' });
    const noteCount = (r.notes || []).length;
    li.querySelector('.journal-spread').textContent = (s ? s.name : r.spread) + (r.interpretation ? ' · interpreted' : '') +
      (noteCount ? ` · ${noteCount} note${noteCount > 1 ? 's' : ''}` : '');
    li.querySelector('.journal-question').textContent = r.question.replace(/\n/g, ' · ') || 'No question';
    const hit = term && !fold(r.question).includes(term) && searchable(r).find(t => fold(t).includes(term));
    if (hit) {
      li.querySelector('.journal-match').hidden = false;
      li.querySelector('.journal-match').textContent = excerpt(hit, term);
    }
    const cardsEl = li.querySelector('.journal-cards');
    r.cards.forEach((n, i) => {
      const img = document.createElement('img');
      const rev = !!r.reversed?.[i];
      img.src = cardThumb(n);
      img.alt = img.title = cardName(n) + (rev ? ', reversed' : '');
      img.classList.toggle('reversed', rev);
      img.loading = 'lazy';
      cardsEl.appendChild(img);
    });
    li.querySelector('.journal-delete').addEventListener('click', () => deleteFromJournal(r.id));
    list.appendChild(li);
  });
}

// Deletes at once; the toast offers an undo, which the server can honour for 30 days.
async function deleteFromJournal(id) {
  try {
    await api(`readings/${id}`, { method: 'DELETE' });
  } catch {
    return toast('Could not delete the reading.');
  }
  const refresh = () => { if (location.hash === '#journal') showJournal(true); };
  refresh();
  toast('Reading deleted.', {
    label: 'Undo',
    run: async () => {
      await api(`readings/${id}/restore`, { method: 'POST' }).catch(() => toast('Could not restore the reading.'));
      refresh();
    },
  });
}

// Suit shares against what an even draw would give.
function renderSuits(readings) {
  const suits = $('suitsBlock');
  const drawn = readings.flatMap(r => r.cards);
  suits.hidden = !readings.length;
  if (!readings.length) return;
  suits.innerHTML = '<h2>Suits</h2><p class="pattern-note">Share of all cards drawn. The tick marks what a perfectly even draw would give.</p>';
  const max = Math.max(...D.suits.map(s => Math.max(drawn.filter(n => D.suitOf(n) === s).length / drawn.length, D.suitSize[s] / D.total)));
  D.suits.forEach(s => {
    const count = drawn.filter(n => D.suitOf(n) === s).length;
    const share = count / drawn.length;
    const expected = D.suitSize[s] / D.total;
    const row = document.createElement('div');
    row.className = 'suit-row';
    row.title = `${s}: ${count} of ${drawn.length} cards (${Math.round(share * 100)}%), an even draw gives ${Math.round(expected * 100)}%`;
    row.innerHTML = `
      <span class="suit-name"></span>
      <span class="suit-track"><span class="suit-bar"></span><span class="suit-tick"></span></span>
      <span class="suit-value"></span>`;
    row.querySelector('.suit-name').textContent = s;
    row.querySelector('.suit-bar').style.width = `${(share / max) * 100}%`;
    row.querySelector('.suit-tick').style.left = `${(expected / max) * 100}%`;
    row.querySelector('.suit-value').textContent = `${Math.round(share * 100)}% · ${count}`;
    suits.appendChild(row);
  });
}

// The cards that keep returning; choosing one lists the readings it appeared in.
function renderRecurring(readings) {
  const rec = $('recurringBlock');
  rec.hidden = !readings.length;
  if (!readings.length) return;
  const counts = new Map();
  readings.forEach(r => r.cards.forEach(n => {
    const c = counts.get(n) || { n, count: 0, last: r.created_at };
    c.count++;
    if (r.created_at > c.last) c.last = r.created_at;
    counts.set(n, c);
  }));
  const recurring = [...counts.values()].filter(c => c.count > 1).sort((a, b) => b.count - a.count || (b.last > a.last ? 1 : -1)).slice(0, 12);
  if (!recurring.some(c => c.n === selectedCard)) selectedCard = null;
  rec.innerHTML = '<h2>Cards that keep coming back</h2>';
  if (!recurring.length) {
    rec.insertAdjacentHTML('beforeend', '<p class="pattern-note">No card has come up twice yet.</p>');
  } else {
    const grid = document.createElement('div');
    grid.className = 'recurring';
    recurring.forEach(c => {
      const b = document.createElement('button');
      b.className = 'recurring-card';
      b.setAttribute('aria-pressed', String(c.n === selectedCard));
      b.innerHTML = '<img alt=""><span class="recurring-name"></span><span class="recurring-count"></span>';
      b.querySelector('img').src = cardThumb(c.n);
      b.querySelector('.recurring-name').textContent = cardName(c.n);
      b.querySelector('.recurring-count').textContent = `${c.count} times · last ${formatDate(c.last, { day: 'numeric', month: 'short' })}`;
      b.addEventListener('click', () => {
        selectedCard = selectedCard === c.n ? null : c.n;
        renderRecurring(journalReadings);
      });
      grid.appendChild(b);
    });
    rec.appendChild(grid);
    if (selectedCard) rec.appendChild(cardReadings(selectedCard, readings));
  }
}

// The readings a card appeared in: date, question and the position it held.
function cardReadings(n, readings) {
  const box = document.createElement('div');
  box.className = 'card-readings';
  box.innerHTML = '<div class="card-readings-head"><h3></h3><button class="ghost">Read the card</button></div><ul></ul>';
  box.querySelector('h3').textContent = `${cardName(n)} appeared in`;
  box.querySelector('button').addEventListener('click', () => openCard(n, null));
  readings.filter(r => r.cards.includes(n)).forEach(r => {
    const i = r.cards.indexOf(n);
    const s = findSpread(r.spread);
    const label = s?.variants[r.variant] && readingPositions(s, r.variant, r.cards, r.rounds?.map(cards => ({ cards })))[i]?.label;
    const li = document.createElement('li');
    li.innerHTML = '<a><span class="journal-date"></span><span class="card-readings-question"></span><span class="card-readings-position"></span></a>';
    li.querySelector('a').href = readingLink(r);
    li.querySelector('.journal-date').textContent = formatDate(r.created_at, { day: 'numeric', month: 'short', year: 'numeric' });
    li.querySelector('.card-readings-question').textContent = r.question.replace(/\n/g, ' · ') || 'No question';
    li.querySelector('.card-readings-position').textContent = `Position ${i + 1}${label ? ` · ${label}` : ''}`;
    box.querySelector('ul').appendChild(li);
  });
  return box;
}

// ---------- copy for Claude ----------

// The reading as plain text with everything an assistant needs and nothing it has to look
// up: the question, the spread, a note on the deck, and each card's full text (for the Osho
// Zen deck, Osho's text and the commentary). "Copy reading" gives it, and the journal
// stores the same text.
// From this many cards on, a spread gets a synthesis rather than a reading of every card.
const BIG_SPREAD = 6;

// The local day, YYYY-MM-DD: a reading drawn after midnight belongs to the new day.
function localDay(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// An ISO time with the local offset, so the journal files a reading under the local day.
function localStamp(t) {
  const d = new Date(t), off = -d.getTimezoneOffset(), two = n => String(Math.floor(n)).padStart(2, '0');
  return `${localDay(d)}T${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}` +
    `${off < 0 ? '-' : '+'}${two(Math.abs(off) / 60)}:${two(Math.abs(off) % 60)}`;
}

function currentReading() {
  return { dk: D, spread, variant: variantIndex, cards: placed, reversed, rounds, ...ownWords(), date: drawnAt };
}

// `more`: the last question of a question-by-question reading can still get a clarifier; not
// when the copy leaves out a question still being drawn for.
function readingText({ dk, spread, variant: v, cards, reversed, rounds, question = '', impression = '', date, more = true } = currentReading()) {
  const variant = spread.variants[v];
  const ps = readingPositions(spread, v, cards, rounds);
  const clarified = !rounds && ps.length > variant.positions.length;
  question = question.trim();
  impression = impression.trim();
  const lines = [
    `${dk.title} reading, ${localDay(date || Date.now())}`,
    '',
    ...(rounds
      ? ['Questions, in the order they were asked:', ...rounds.map((r, i) => `${r.n ?? i + 1}. ${r.question.replace(/\s+/g, ' ').trim() || '(none; read its cards as a general look at here and now)'}${r.fresh ? ' (before it, the deck was made whole again and reshuffled)' : ''}`)]
      : [`Question: ${question || '(none; read it as a general reading for here and now)'}`]),
    ...(impression ? ['', `My first impression, written before reading the card texts: ${impression}`] : []),
    '',
    `Spread: ${spread.name}${variant.name ? ` (${variant.name})` : ''}`,
    spread.intro,
    '',
    'How this works: I draw the cards myself on a tarot site and paste them to you here; you cannot draw them. ' +
    (!rounds
      ? 'If the cards need it, ask me to draw a clarifier: one more card from the same deck that sheds light on the ' +
        'spread as a whole. I will paste it briefly, just the card and its text, without repeating these notes: ' +
        'read it in the light of what you already said.'
      : (more ? "If the last question's cards need it, ask me to draw a clarifier: one more card for that question. " : '') +
        `I may ${more ? 'also ' : ''}go on to a next question, with three cards from what is left of the same deck. I will paste each ` +
        'new card or question briefly, just the question and its cards with their texts, without repeating these ' +
        'notes: read it the same way, in the light of what came before. Before a question I may also make the deck ' +
        'whole again and reshuffle it; then a card may come up again, and that is worth noticing.'),
    '',
    dk.note,
    ...(reversed ? ['', 'Reversed cards were in play: each card came up upright or reversed at random, and the reversed ones are marked.'] : []),
    '',
    ...cardLines(dk, ps, cards, reversed),
  ];
  lines.push(
    '',
    '---',
    '',
    'Please interpret this reading, as a conversation rather than a verdict. If the question is ' +
    'unclear, or you need more context about my situation to read the cards well, ask me first: ' +
    'a few short questions at a time, and wait for my answers before interpreting. ' +
    (impression ? 'Start from my first impression: it is what I saw in the cards before any explanation. ' : '') +
    (rounds
      ? 'Answer the questions in the order they were asked, each from its own cards: its first three, ' +
        'then any clarifier, which was drawn to clarify or ground them. Keep each answer short, and say ' +
        'where a later question picks up an earlier one. '
      : (clarified ? 'Read the clarifiers, drawn after the spread was complete, as light on the spread as a whole. ' : '') +
        (ps.length >= BIG_SPREAD
          ? 'This is a big spread, so rather than an essay on every card, give a short synthesis in the light ' +
            'of the positions and the texts above, name one or two tensions between the cards, and end with a ' +
            'question back to me. '
          : 'Then read each card in the light of its position and of the texts above, and bring them together ' +
            'into one answer to the question. ')) +
    'Positions about another person are lenses, not mind-reading. If a card does not fit my life, ' +
    'a mismatch is information, not resistance. Afterwards, offer to go deeper into any card or any ' +
    'part of the answer. Reply in the language of the question.',
  );
  return lines.join('\n');
}

// The cards by position, then each card's full text.
function cardLines(dk, ps, cards, reversed) {
  const clean = t => t.replace(/\r\n/g, '\n').trim();
  const card = i => `${cardName(cards[i], dk)}${reversed?.[i] ? ', reversed' : ''} (${cardRank(cards[i], dk)})`;
  return [
    'Cards, by position:',
    ...ps.map((p, i) => `${i + 1}. ${p.label}: ${card(i)}`),
    ...ps.flatMap((p, i) => ['', '---', '', `${i + 1}. ${p.label}`, card(i), '', ...dk.about(cards[i], !!reversed?.[i]).map(clean)]),
  ];
}

// Part of a question-by-question reading as its own text, questions `first` up to `last`;
// it can be copied while the sitting is still open, each question once it has its three
// cards. "Copy reading" starts the conversation and explains everything; a `brief` copy of
// one question goes into that same conversation, so it carries only the question and its cards.
function sittingText(first, last, brief = false) {
  const at = rounds.slice(0, first).reduce((t, r) => t + r.cards, 0);
  const rs = rounds.slice(first, last).map((r, i) => ({ ...r, n: first + i + 1 }));
  const count = rs.reduce((t, r) => t + r.cards, 0);
  const cards = placed.slice(at, at + count), rev = reversed?.slice(at, at + count) ?? null;
  if (!brief) {
    return readingText({ ...currentReading(), rounds: rs, cards, reversed: rev, more: last === rounds.length });
  }
  return [
    ...rs.map(r => `Question ${r.n}: ${r.question.replace(/\s+/g, ' ').trim() || '(none; read its cards as a general look at here and now)'}`),
    ...(rs.some(r => r.fresh) ? ['Before this question I made the deck whole again and reshuffled it.'] : []),
    '',
    ...cardLines(D, sessionPositions(rs), cards, rev),
    '',
    '---',
    '',
    'The same sitting: read this question the same way, from its own cards, in the light of what came before.',
  ].join('\n');
}

// A spread's clarifiers on their own, for the conversation its "Copy reading" started.
function clarifierText() {
  const base = spread.variants[variantIndex].positions.length;
  return [
    'A clarifier for the same reading:',
    '',
    ...cardLines(D, readingPositions(spread, variantIndex, placed).slice(base), placed.slice(base), reversed?.slice(base) ?? null),
    '',
    '---',
    '',
    'Read it as light on the spread as a whole, in the light of what you already said.',
  ].join('\n');
}

// The questions that have their three cards; all of them but a next one just asked.
const completeRounds = () => rounds.length - (rounds.at(-1).cards < 3 ? 1 : 0);

const copyQuestion = ri => copyText(sittingText(ri, ri + 1, true), `Question ${ri + 1} copied.`);

function copyReading() {
  if (spread.session && !finished) return copyText(sittingText(0, completeRounds()), 'Reading so far copied.');
  copyText(readingText(), 'Reading copied.');
}

function hideToastAction() {
  if ($('toastAction').hidden) return;
  $('toastAction').hidden = true;
  $('toastAction').onclick = null;
  $('toast').classList.remove('show');
}

// A short message; with `action`, a button too, and it stays up longer.
function toast(message, action) {
  const t = $('toast');
  const button = $('toastAction');
  $('toastText').textContent = message;
  button.hidden = !action;
  button.onclick = null;
  if (action) {
    button.textContent = action.label;
    button.onclick = () => { t.classList.remove('show'); action.run(); };
  }
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), action ? 7000 : 2600);
}

// ---------- dialogs ----------

let detailIndex = null;  // the position shown in the card window, if it was opened from one

function openCard(n, positionIndex) {
  detailIndex = positionIndex;
  const multi = positionIndex != null && placed.length > 1;
  $('detailPrev').hidden = $('detailNext').hidden = !multi;
  if (multi) {
    $('detailPrev').disabled = positionIndex === 0;
    $('detailNext').disabled = positionIndex >= placed.length - 1;
  }
  const img = $('detailImage');
  img.onerror = () => { img.onerror = null; img.src = cardThumb(n); };  // offline: the thumbnail is cached
  img.src = cardImage(n);
  const rev = positionIndex != null && isRev(positionIndex);
  img.classList.toggle('reversed', rev);
  img.alt = cardName(n) + (rev ? ', reversed' : '');
  $('detailName').textContent = cardName(n);
  $('detailSuit').textContent = cardRank(n) + (rev ? ' · Reversed' : '');
  $('detailPosition').textContent =
    positionIndex == null ? '' : `Position ${positionIndex + 1} · ${positions()[positionIndex].label}`;
  const [[, text], [heading, second]] = D.texts(n, rev);
  paragraphs($('detailText'), text);
  $('detailHeading').textContent = heading;
  paragraphs($('detailCommentary'), second);
  const dialog = $('cardDialog');
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('.card-detail-text').scrollTop = 0;
  dialog.scrollTop = 0;
}

function stepCard(delta) {
  const i = detailIndex == null ? -1 : detailIndex + delta;
  if (i < 0 || i >= placed.length) return;
  openCard(placed[i], i);
}

function renderBrowse() {
  const grid = $('browseGrid');
  grid.replaceChildren();
  D.suits.forEach(suit => {
    const h = document.createElement('h3');
    h.textContent = suit;
    const group = document.createElement('div');
    group.className = 'browse-group';
    for (const n of D.order()) {
      if (D.suitOf(n) !== suit) continue;
      const b = document.createElement('button');
      b.className = 'browse-card';
      b.innerHTML = `<img loading="lazy" src="${cardThumb(n)}" alt=""><span></span>`;
      b.querySelector('span').textContent = cardName(n);
      b.addEventListener('click', () => openCard(n, null));
      group.appendChild(b);
    }
    grid.append(h, group);
  });
}

let coinAngle = 0;

// Spins the coin five full turns and lands it on the drawn face.
function flipCoin() {
  const heads = randomInt(2) === 0;
  const stage = $('coinStage');
  coinAngle = Math.ceil(coinAngle / 360) * 360 + 5 * 360 + (heads ? 0 : 180);
  const coin = $('coin');
  coin.dataset.side = '';
  coin.style.transform = `rotateY(${coinAngle}deg)`;
  stage.classList.remove('toss');
  void stage.offsetWidth;
  stage.classList.add('toss');
  $('coinResult').textContent = '';
  $('flipAgain').disabled = true;
  play('coinFlick');
  play('coinLand', 1.08);
  setTimeout(() => {
    coin.dataset.side = heads ? 'heads' : 'tails';
    $('coinResult').textContent = heads ? 'Heads' : 'Tails';
    $('flipAgain').disabled = false;
  }, reducedMotion.matches ? 0 : 1200);
  track('Heads or Tails Button');
}

// ---------- the deck switch ----------

// Switches the whole site to another deck; the caller decides what to show next. A reading
// on screen belongs to the deck it was drawn with, so it is left first: a question edit
// still waiting goes out while its deck is current.
function setDeck(id) {
  if (!DECKS[id] || DECKS[id] === D) return;
  beginTransition();
  spread = null;
  D = DECKS[id];
  try { localStorage.setItem('tarot-deck', D.id); } catch {}
  renderDeck();
}

function renderDeck() {
  document.body.dataset.deck = D.id;
  document.title = D.title;
  $('brand').textContent = D.title;
  document.querySelectorAll('#deckSwitch button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.deck === D.id)));
  $('journalTitle').textContent = D.id === 'osho' ? 'Journal' : `Journal · ${D.title}`;
  renderDaily();
  renderPicker();
  renderBrowse();
}

function onDeckSwitch(id) {
  if (DECKS[id] === D) return;
  const toJournal = location.hash === '#journal';
  if (location.hash && !toJournal) history.pushState(null, '', location.pathname + location.search);
  setDeck(id);
  if (toJournal) showJournal();
  else showHome();
  track(`Deck: ${D.title}`);
}

function renderReversalsButton() {
  const b = $('reversalsButton');
  b.hidden = !D.reversals || placed.length > 0;  // settled by the first card
  b.textContent = reversals ? 'Reversed cards: on' : 'Reversed cards: off';
  b.setAttribute('aria-pressed', String(reversals));
  b.classList.toggle('on', reversals);
}

function toggleReversals() {
  reversals = !reversals;
  try { localStorage.setItem('tarot-reversals', reversals ? 'on' : 'off'); } catch {}
  renderReversalsButton();
}

function track(name) {
  if (window.goatcounter?.count) {
    window.goatcounter.count({ path: name, title: name, event: true });
  }
}

// ---------- wiring ----------

// `initial` is the first route after the page loads: a reading kept on this device that
// matches the address is resumed rather than started again.
function route(initial = false) {
  // A question asked of Jev, brought along by opening one of its spreads.
  const q = carriedQuestion;
  carriedQuestion = '';
  let h;
  try { h = decodeURIComponent(location.hash.slice(1)); } catch { return showHome(); }
  if (!h) return showHome();
  if (h === 'journal') return showJournal();
  const kept = initial ? localReadings().filter(validEntry) : [];
  if (h.startsWith('r?')) {
    const params = new URLSearchParams(location.hash.slice(3));
    const e = kept.find(x => x.readingId && x.readingId === params.get('id')) || !params.get('id') && kept.find(x => entryDeck(x).id === (params.get('d') || 'osho') && x.spread === params.get('s') &&
      (x.reversed ? x.reversed.map(Number).join('') : null) === params.get('rv') &&
      (x.rounds ? x.rounds.map(r => r.cards).join('-') : null) === params.get('g') &&
      (reshuffledOf(x.rounds).join('-') || null) === params.get('f') &&
      String(x.variant) === (params.get('v') ?? '0') && x.placed.join('-') === params.get('c'));
    return e ? resumeLocal(e) : openSharedReading(params);
  }
  const [id, v = '0'] = h.split('/');
  const e = kept.find(x => entryDeck(x) === D && x.spread === id && String(x.variant) === v && !entryDone(x));
  if (e) return resumeLocal(e);
  openSpread(id, Number(v), q);
}

document.querySelectorAll('dialog').forEach(d => {
  d.querySelector('.close').addEventListener('click', () => d.close());
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
});

$('browseButton').addEventListener('click', () => $('browseDialog').showModal());
$('coinButton').addEventListener('click', () => { $('coinDialog').showModal(); flipCoin(); });
$('flipAgain').addEventListener('click', flipCoin);
$('soundButton').addEventListener('click', toggleSound);
$('reversalsButton').addEventListener('click', toggleReversals);
$('nextQuestionButton').addEventListener('click', nextQuestion);
$('resetDeckButton').addEventListener('click', resetDeck);
$('finishButton').addEventListener('click', finishSession);
$('continueButton').addEventListener('click', reopen);
document.querySelectorAll('#deckSwitch button').forEach(b => b.addEventListener('click', () => onDeckSwitch(b.dataset.deck)));
$('copyButton').addEventListener('click', copyReading);
$('linkButton').addEventListener('click', () => copyText(location.href, 'Link copied.'));
$('undoButton').addEventListener('click', undo);
$('resetButton').addEventListener('click', () => {
  // Starting over on purpose: the unfinished reading need not be offered again.
  if (localKey && !isDone()) dropLocal(localKey);
  newReading();
});
$('shuffleButton').addEventListener('click', shuffleDeck);
$('cutButton').addEventListener('click', cutDeck);
$('variantSelect').addEventListener('change', changeVariant);
$('question').addEventListener('input', onWordsInput);
$('askJev').addEventListener('submit', askJev);
$('askQuestion').addEventListener('keydown', e => {
  // Enter asks, Shift+Enter starts a new line.
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('askJev').requestSubmit(); }
});
$('impression').addEventListener('input', onWordsInput);
$('detailPrev').addEventListener('click', () => stepCard(-1));
$('detailNext').addEventListener('click', () => stepCard(1));
$('cardDialog').addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') stepCard(-1);
  if (e.key === 'ArrowRight') stepCard(1);
});
document.querySelectorAll('#notePrompts .chip').forEach(c => {
  c.addEventListener('click', () => setNotePrompt(notePrompt === c.textContent ? '' : c.textContent));
});
$('noteSave').addEventListener('click', addNote);
$('journalSearch').addEventListener('input', () => renderJournalList());
window.addEventListener('hashchange', () => route());
new ResizeObserver(() => { if (spread) layoutFan(); }).observe($('fan'));

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

renderSoundButton();
if (sound.on) loadSounds();
// Browsers start audio suspended until the first tap or click.
document.addEventListener('pointerdown', () => { if (sound.on) audio(); }, { once: true });
renderDeck();
detectServer().then(() => {
  route(true);
  saveKeptReadings();
});
