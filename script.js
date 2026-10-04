// script.js

const TOTAL_CARDS = 79;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const $ = id => document.getElementById(id);

let spread = null;
let variantIndex = 0;
let deck = [];          // face-down card numbers, in fan order
let placed = [];        // card number per position, in drawing order
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

// What Batu writes himself on a reading.
function ownWords() {
  return { question: $('question').value.trim(), impression: $('impression').value.trim() };
}

function beginTransition() {
  flushQuestion();
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
const server = { on: false };

// ---------- cards ----------

function cardName(n) {
  return cardNames[n - 1];
}

function suitOf(n) {
  if (n <= 23) return 'Major Arcana';
  if (n <= 37) return 'Clouds';
  if (n <= 51) return 'Fire';
  if (n <= 65) return 'Rainbows';
  return 'Water';
}

const SUITS = ['Major Arcana', 'Clouds', 'Fire', 'Rainbows', 'Water'];
const SUIT_SIZE = { 'Major Arcana': 23, Clouds: 14, Fire: 14, Rainbows: 14, Water: 14 };

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

// "Major Arcana IX", "Major Arcana, The Master", "Page of Clouds"
function cardRank(n) {
  const suit = suitOf(n);
  const rank = ranks[cardName(n)];
  if (suit === 'Major Arcana') return rank === 'The Master' ? 'Major Arcana, The Master' : `Major Arcana ${rank}`;
  return `${rank} of ${suit}`;
}

// Full size for the detail view; small copies everywhere else.
function cardImage(n) {
  return `assets/CardPictures/card_${n}.jpg`;
}

function cardThumb(n) {
  return `assets/CardPictures/small/card_${n}.webp`;
}

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
  positions.forEach(({ x, y, rot }) => {
    const a = (rot * Math.PI) / 180;
    const hw = 0.5 * Math.abs(Math.cos(a)) + 0.75 * Math.abs(Math.sin(a));
    const hh = 0.5 * Math.abs(Math.sin(a)) + 0.75 * Math.abs(Math.cos(a));
    minX = Math.min(minX, x - hw); maxX = Math.max(maxX, x + hw);
    minY = Math.min(minY, y - hh); maxY = Math.max(maxY, y + hh);
  });
  const pad = 0.06;
  return { minX: minX - pad, minY: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad };
}

// Lays positions out inside `el` as absolutely placed slots; returns the slots.
function layout(el, positions) {
  const b = bounds(positions);
  el.style.setProperty('--ratio', b.w / b.h);
  el.replaceChildren();
  return positions.map((p, i) => {
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.style.left = `${((p.x - 0.5 - b.minX) / b.w) * 100}%`;
    slot.style.top = `${((p.y - 0.75 - b.minY) / b.h) * 100}%`;
    slot.style.width = `${(1 / b.w) * 100}%`;
    slot.style.height = `${(1.5 / b.h) * 100}%`;
    slot.style.zIndex = i + 1;
    if (p.rot) slot.style.transform = `rotate(${p.rot}deg)`;
    el.appendChild(slot);
    return slot;
  });
}

// ---------- home: card of the day and the spread picker ----------

// The same card all day, for everyone: an FNV-1a hash of the local date picks it.
function cardOfTheDay(date = new Date()) {
  const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  let h = 2166136261;
  for (const ch of key) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % TOTAL_CARDS) + 1;
}

function renderDaily() {
  const n = cardOfTheDay();
  $('dailyImage').src = cardThumb(n);
  $('dailyImage').alt = cardName(n);
  $('dailyDate').textContent = `Card of the day · ${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}`;
  $('dailyName').textContent = cardName(n);
  $('dailyRank').textContent = cardRank(n);
  $('dailyExcerpt').textContent = cardData[n].text.split(/\r?\n\s*\r?\n/)[0].trim();
  const open = () => openCard(n, null);
  $('dailyCard').onclick = open;
  $('dailyMore').onclick = open;
}

function renderPicker() {
  const grid = $('spreadGrid');
  spreads.forEach(s => {
    const tile = document.createElement('a');
    tile.className = 'spread-tile';
    tile.href = `#${s.id}`;
    const mini = document.createElement('div');
    mini.className = 'mini-board';
    layout(mini, s.variants[0].positions);
    const counts = [...new Set(s.variants.map(v => v.positions.length))];
    const count = counts.length > 1 ? `${Math.min(...counts)}–${Math.max(...counts)} cards` : `${counts[0]} card${counts[0] > 1 ? 's' : ''}`;
    tile.append(mini);
    tile.insertAdjacentHTML('beforeend', '<span class="tile-name"></span><span class="tile-count"></span>');
    tile.querySelector('.tile-name').textContent = s.name;
    tile.querySelector('.tile-count').textContent = count;
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

function storeLocal(list) {
  try { localStorage.setItem(LOCAL_STORE, JSON.stringify(list.slice(0, 12))); } catch {}
}

function dropLocal(key) {
  storeLocal(localReadings().filter(e => e.key !== key));
}

function entryDone(e) {
  const s = spreads.find(sp => sp.id === e.spread);
  return !!s && e.placed.length >= s.variants[e.variant].positions.length;
}

// Entries are read back from storage, so they are checked like a link would be.
function validEntry(e) {
  const s = e && spreads.find(sp => sp.id === e.spread);
  const ok = n => Number.isInteger(n) && n >= 1 && n <= TOTAL_CARDS;
  return !!s && Number.isInteger(e.variant) && e.variant >= 0 && e.variant < s.variants.length &&
    Array.isArray(e.placed) && e.placed.every(ok) && e.placed.length <= s.variants[e.variant].positions.length &&
    Array.isArray(e.deck) && e.deck.every(ok) && new Set([...e.placed, ...e.deck]).size === e.placed.length + e.deck.length;
}

// Where the journal exists: the server has answered on this origin before, so a finished
// reading that could not be saved (offline, say) is kept until it can be.
let journalOrigin = false;
try { journalOrigin = localStorage.getItem('tarot-journal') === 'yes'; } catch {}

function keepLocal() {
  if (!localKey || !spread) return;
  let list = localReadings().filter(e => e.key !== localKey);
  const done = isDone();
  if (placed.length && !readingId && (!done || journalOrigin)) {
    if (!done) list = list.filter(entryDone);
    list.unshift({
      key: localKey, spread: spread.id, variant: variantIndex, placed, deck, cutDone,
      question: $('question').value, impression: $('impression').value, drawnAt, at: new Date().toISOString(),
    });
  }
  storeLocal(list);
}

function resumeLocal(e) {
  if (!validEntry(e)) {
    dropLocal(e?.key);
    return showHome();
  }
  beginTransition();
  setupSpread(spreads.find(sp => sp.id === e.spread), e.variant);
  placed = e.placed;
  deck = e.deck;
  cutDone = e.cutDone || isParadox() && placed.length >= 2;
  fanMode = 'fan';
  resetJournalState();
  localKey = e.key;
  drawnAt = e.drawnAt || (isDone() ? e.at : null);
  $('question').value = e.question || '';
  $('impression').value = e.impression || '';
  renderBoard();
  renderFan();
  update();
  if (isDone()) saveReading();
}

// Saves finished readings that were kept on this device while the journal was out of reach.
async function saveKeptReadings() {
  if (!server.on) return;
  let saved = 0;
  for (const e of localReadings()) {
    if (e.key === localKey || !validEntry(e) || !entryDone(e)) continue;
    dropLocal(e.key);  // claimed, so the home list cannot open it while it saves
    const s = spreads.find(sp => sp.id === e.spread);
    const at = e.drawnAt || e.at;
    try {
      await api('readings', {
        method: 'POST',
        body: JSON.stringify({
          spread: e.spread, variant: e.variant, question: (e.question || '').trim(),
          impression: (e.impression || '').trim(), cards: e.placed, created_at: at,
          summary: readingText({ spread: s, variant: e.variant, cards: e.placed, question: e.question, impression: e.impression, date: at }),
        }),
      });
      saved++;
    } catch {
      storeLocal([...localReadings(), e]);
      break;
    }
  }
  if (!saved) return;
  toast(saved === 1 ? 'A reading kept on this device was saved to your journal.' : `${saved} readings kept on this device were saved to your journal.`);
  if (!$('pickerView').hidden) renderLocal();
  if (location.hash === '#journal') showJournal(true);
}

function renderLocal() {
  const list = $('localList');
  list.replaceChildren();
  const entries = localReadings().filter(validEntry);
  $('localBlock').hidden = !entries.length;
  entries.forEach(e => {
    const s = spreads.find(sp => sp.id === e.spread);
    const total = s.variants[e.variant].positions.length;
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
      ? `Not yet saved to journal · ${formatDate(e.drawnAt || e.at, { day: 'numeric', month: 'short' })}`
      : `Unfinished, ${e.placed.length} of ${total} cards · Resume`;
    li.querySelector('.local-question').textContent = (e.question || '').trim();
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
  const list = recentSpreads().filter(r => r.spread !== spread.id || r.variant !== variantIndex);
  list.unshift({ spread: spread.id, variant: variantIndex });
  try { localStorage.setItem('tarot-recent', JSON.stringify(list.slice(0, 4))); } catch {}
}

function renderRecent() {
  const row = $('recentRow');
  row.replaceChildren();
  const recent = recentSpreads().filter(r => {
    const s = spreads.find(sp => sp.id === r.spread);
    return s && Number.isInteger(r.variant) && r.variant >= 0 && r.variant < s.variants.length;
  });
  $('recentBlock').hidden = !recent.length;
  recent.forEach(r => {
    const s = spreads.find(sp => sp.id === r.spread);
    const a = document.createElement('a');
    a.className = 'recent-tile';
    a.href = spreadHash(s, r.variant);
    const mini = document.createElement('div');
    mini.className = 'mini-board';
    layout(mini, s.variants[r.variant].positions);
    a.append(mini);
    a.insertAdjacentHTML('beforeend', '<span class="recent-text"><span class="tile-name"></span><span class="tile-count"></span></span>');
    a.querySelector('.tile-name').textContent = s.name;
    a.querySelector('.tile-count').textContent = s.variants.length > 1 ? s.variants[r.variant].name : `${s.variants[r.variant].positions.length} card${s.variants[r.variant].positions.length > 1 ? 's' : ''}`;
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

function positions() {
  return spread.variants[variantIndex].positions;
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

function openSpread(id, variant = 0) {
  const s = spreads.find(sp => sp.id === id);
  if (!s) return showHome();
  beginTransition();  // before anything about the old reading is replaced
  setupSpread(s, Number.isInteger(variant) && variant >= 0 ? variant : 0);
  $('question').value = '';
  newReading();
  track(`Spread: ${s.name}`);
}

// Opens a finished reading from a link: #r?s=<spread>&v=<variant>&c=<cards>&q=<question>&id=<journal id>
function openSharedReading(params) {
  const s = spreads.find(sp => sp.id === params.get('s'));
  if (!s) return showHome();
  const v = Number(params.get('v') ?? 0);
  const cards = (params.get('c') || '').split('-').map(Number);
  if (!Number.isInteger(v) || v < 0 || v >= s.variants.length) return openSpread(s.id);
  const valid = cards.length === s.variants[v].positions.length &&
    cards.every(n => Number.isInteger(n) && n >= 1 && n <= TOTAL_CARDS) && new Set(cards).size === cards.length;
  if (!valid) return openSpread(s.id);
  beginTransition();
  setupSpread(s, v);
  placed = cards;
  deck = shuffle(Array.from({ length: TOTAL_CARDS }, (_, i) => i + 1).filter(n => !cards.includes(n)));
  cutDone = true;
  fanMode = 'fan';
  $('question').value = params.get('q') || '';
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
  deck = shuffle(Array.from({ length: TOTAL_CARDS }, (_, i) => i + 1));
  placed = [];
  fanMode = 'fan';
  cutDone = false;
  resetJournalState();
  localKey = crypto.randomUUID?.() ?? String(Math.random()).slice(2);
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
      fillSlot(slot, placed[i], false);
    } else {
      slot.classList.add('empty');
      slot.innerHTML = `<span class="slot-num">${i + 1}</span>`;
    }
  });
}

function slotAt(i) {
  return $('board').querySelector(`.slot[data-index="${i}"]`);
}

function fillSlot(slot, n, animate) {
  slot.classList.remove('empty', 'next');
  slot.innerHTML = `
    <button class="card3d" aria-label="${cardName(n)}">
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
  return placed.length >= positions().length;
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
  $('deckControls').hidden = done || placed.length > 0 || fanMode === 'piles' || (isParadox() && cutDone);

  const list = $('positions');
  list.replaceChildren();
  ps.forEach((p, i) => {
    const li = document.createElement('li');
    const n = placed[i];
    li.className = n ? 'filled' : i === placed.length ? 'next' : '';
    li.innerHTML = '<span class="pos-num"></span><span class="pos-text"><span class="pos-label"></span><span class="pos-card"></span></span>';
    li.querySelector('.pos-num').textContent = i + 1;
    li.querySelector('.pos-label').textContent = p.label;
    li.querySelector('.pos-card').textContent = n ? cardName(n) : '';
    if (n) li.addEventListener('click', () => openCard(n, i));
    list.appendChild(li);
  });

  $('impressionField').hidden = !done;
  $('copyButton').disabled = !done;
  $('linkButton').disabled = !done;
  $('undoButton').disabled = placed.length === 0 || flying || !!interpretation ||
    (readingId && !ownReading) || (isParadox() && placed.length <= 2);
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
function shuffleDeck() {
  if (flying || placed.length) return;
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
  if (flying || placed.length) return;
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
  place(cardEl).then(() => {
    if (!isCurrent(g)) return;
    flying = false;
    if (isDone()) {
      drawnAt = new Date().toISOString();
      rememberSpread();
    }
    update();
    if (isDone()) saveReading();
  });
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
  new Image().src = cardThumb(n);

  if (reducedMotion.matches) {
    cardEl.remove();
    fillSlot(slot, n, false);
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
        fillSlot(slot, n, true);
      }
      resolve();
    };
    flyer.addEventListener('transitionend', land, { once: true });
    setTimeout(land, 900);
  });
}

function undo() {
  if (flying || placed.length === 0 || interpretation || (readingId && !ownReading)) return;
  if (readingId) discardSaved();
  if (pendingSave) pendingSave.cancelled = true;
  pendingSave = null;
  gen++;
  saving = false;
  saveFailed = false;
  clearTimeout(questionTimer);
  questionTimer = null;
  const n = placed.pop();
  deck.splice(randomInt(deck.length + 1), 0, n);
  drawnAt = null;
  renderBoard();
  renderFan();
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
  const p = new URLSearchParams({ s: spread.id, v: variantIndex, c: placed.join('-') });
  const q = $('question').value.trim();
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
    server.on = res.ok && (await res.json()).ok === true;
  } catch {
    server.on = false;
  }
  if (server.on && !journalOrigin) {
    journalOrigin = true;
    try { localStorage.setItem('tarot-journal', 'yes'); } catch {}
  }
  $('journalLink').hidden = !server.on;
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
  let r;
  try {
    r = await api('readings', {
      method: 'POST',
      body: JSON.stringify({
        spread: spread.id, variant: variantIndex, ...words, cards: placed, summary: readingText(),
        ...(drawnAt && { created_at: drawnAt }),
      }),
    });
  } catch {
    if (pendingSave === job) pendingSave = null;
    if (!isCurrent(g)) return;
    saving = false;
    saveFailed = true;
    update();
    toast('Could not save to the journal.', { label: 'Retry', run: () => { if (isCurrent(g)) saveReading(); } });
    return;
  }
  if (pendingSave === job) pendingSave = null;
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

function discardSaved() {
  const id = readingId;
  readingId = null;
  stopPolling();
  if (server.on && id) api(`readings/${id}`, { method: 'DELETE' }).catch(() => {});
}

// The question and the first impression; both are saved the same way.
let questionTimer = null;
function onWordsInput() {
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
  if (!readingId || !verified) return;
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
  if (r.spread !== spread.id || r.variant !== variantIndex || r.cards.join('-') !== placed.join('-')) {
    const link = readingLink(r);
    history.replaceState(null, '', link);
    return openSharedReading(new URLSearchParams(link.slice(3)));
  }
  $('question').value = r.question;
  $('impression').value = r.impression || '';
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
  const key = earlier.map(e => e.interpreted_at).join('|');
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
  const g = gen, id = readingId;
  $('noteSave').disabled = true;
  try {
    const n = await api(`readings/${id}/notes`, { method: 'POST', body: JSON.stringify({ prompt: notePrompt, text }) });
    if (!isCurrent(g) || readingId !== id) return;
    notes.push(n);
    $('noteText').value = '';
    setNotePrompt('');
    renderNotes();
  } catch {
    if (isCurrent(g)) toast('Could not save the note.');
  } finally {
    $('noteSave').disabled = false;
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
  if (!refresh) window.scrollTo(0, 0);
  $('journalSummary').textContent = 'Loading…';
  let readings;
  try {
    readings = await api('readings');
  } catch {
    if (isCurrent(g)) $('journalSummary').textContent = 'The journal could not be loaded.';
    return;
  }
  if (!isCurrent(g)) return;
  journalReadings = readings;
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
  const p = new URLSearchParams({ s: r.spread, v: r.variant, c: r.cards.join('-') });
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
    const s = spreads.find(sp => sp.id === r.spread);
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
    li.querySelector('.journal-question').textContent = r.question || 'No question';
    const hit = term && !fold(r.question).includes(term) && searchable(r).find(t => fold(t).includes(term));
    if (hit) {
      li.querySelector('.journal-match').hidden = false;
      li.querySelector('.journal-match').textContent = excerpt(hit, term);
    }
    const cardsEl = li.querySelector('.journal-cards');
    r.cards.forEach(n => {
      const img = document.createElement('img');
      img.src = cardThumb(n);
      img.alt = cardName(n);
      img.title = cardName(n);
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
  const max = Math.max(...SUITS.map(s => Math.max(drawn.filter(n => suitOf(n) === s).length / drawn.length, SUIT_SIZE[s] / TOTAL_CARDS)));
  SUITS.forEach(s => {
    const count = drawn.filter(n => suitOf(n) === s).length;
    const share = count / drawn.length;
    const expected = SUIT_SIZE[s] / TOTAL_CARDS;
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
    const label = spreads.find(sp => sp.id === r.spread)?.variants[r.variant]?.positions[i]?.label;
    const li = document.createElement('li');
    li.innerHTML = '<a><span class="journal-date"></span><span class="card-readings-question"></span><span class="card-readings-position"></span></a>';
    li.querySelector('a').href = readingLink(r);
    li.querySelector('.journal-date').textContent = formatDate(r.created_at, { day: 'numeric', month: 'short', year: 'numeric' });
    li.querySelector('.card-readings-question').textContent = r.question || 'No question';
    li.querySelector('.card-readings-position').textContent = `Position ${i + 1}${label ? ` · ${label}` : ''}`;
    box.querySelector('ul').appendChild(li);
  });
  return box;
}

// ---------- copy for Claude ----------

// The reading as plain text with everything an assistant needs and nothing it has to look
// up: the question, the spread, a note on the deck, and each card's full Osho text and
// commentary. "Copy reading" gives it, and the journal stores the same text.
const DECK_NOTE = [
  'About the deck: the Osho Zen Tarot is about understanding the here and now, not predicting the future.',
  'The Major Arcana (0 to XXI, plus The Master) are the central themes of the spiritual journey; when one appears it carries special weight, and a reading without any suggests a passing chapter rather than a turning point.',
  'The four suits: Fire is action and response, following the gut; Water is the emotions, receptive; Clouds is the mind, which hides the light but comes and goes; Rainbows is the practical, material side of life, earth and spirit as one.',
  "Treat the cards and Osho's words as a mirror for reflection, not as facts, predictions, or medical or psychological diagnoses, and read positions about the future or past lives in that same reflective way.",
].join(' ');

// From this many cards on, a spread gets a synthesis rather than a reading of every card.
const BIG_SPREAD = 6;

function currentReading() {
  return { spread, variant: variantIndex, cards: placed, ...ownWords(), date: drawnAt };
}

function readingText({ spread, variant: v, cards, question = '', impression = '', date } = currentReading()) {
  const variant = spread.variants[v];
  const ps = variant.positions;
  question = question.trim();
  impression = impression.trim();
  const clean = t => t.replace(/\r\n/g, '\n').trim();
  const lines = [
    `Osho Zen Tarot reading, ${(date ? new Date(date) : new Date()).toISOString().slice(0, 10)}`,
    '',
    `Question: ${question || '(none; read it as a general reading for here and now)'}`,
    ...(impression ? ['', `My first impression, written before reading the card texts: ${impression}`] : []),
    '',
    `Spread: ${spread.name}${variant.name ? ` (${variant.name})` : ''}`,
    spread.intro,
    '',
    DECK_NOTE,
    '',
    'Cards, by position:',
    ...ps.map((p, i) => `${i + 1}. ${p.label}: ${cardName(cards[i])} (${cardRank(cards[i])})`),
  ];
  ps.forEach((p, i) => {
    const n = cards[i];
    lines.push(
      '',
      '---',
      '',
      `${i + 1}. ${p.label}`,
      `${cardName(n)} (${cardRank(n)})`,
      '',
      'Osho on this card:',
      clean(cardData[n].text),
      '',
      'Commentary:',
      clean(cardData[n].commentary),
    );
  });
  lines.push(
    '',
    '---',
    '',
    'Please interpret this reading, as a conversation rather than a verdict. If the question is ' +
    'unclear, or you need more context about my situation to read the cards well, ask me first: ' +
    'a few short questions at a time, and wait for my answers before interpreting. ' +
    (impression ? 'Start from my first impression: it is what I saw in the cards before any explanation. ' : '') +
    (ps.length >= BIG_SPREAD
      ? 'This is a big spread, so rather than an essay on every card, give a short synthesis in the light ' +
        'of the positions and the texts above, name one or two tensions between the cards, and end with a ' +
        'question back to me. '
      : 'Then read each card in the light of its position and of the texts above, and bring them together ' +
        'into one answer to the question. ') +
    'Positions about another person are lenses, not mind-reading. If a card does not fit my life, ' +
    'a mismatch is information, not resistance. Afterwards, offer to go deeper into any card or any ' +
    'part of the answer. Reply in the language of the question.',
  );
  return lines.join('\n');
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
  $('detailImage').alt = cardName(n);
  $('detailName').textContent = cardName(n);
  $('detailSuit').textContent = cardRank(n);
  $('detailPosition').textContent =
    positionIndex == null ? '' : `Position ${positionIndex + 1} · ${positions()[positionIndex].label}`;
  paragraphs($('detailText'), cardData[n].text);
  paragraphs($('detailCommentary'), cardData[n].commentary);
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
  SUITS.forEach(suit => {
    const h = document.createElement('h3');
    h.textContent = suit;
    const group = document.createElement('div');
    group.className = 'browse-group';
    // `ranks` lists the cards in deck order
    for (const name of Object.keys(ranks)) {
      const n = cardNames.indexOf(name) + 1;
      if (suitOf(n) !== suit) continue;
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

function track(name) {
  if (window.goatcounter?.count) {
    window.goatcounter.count({ path: name, title: name, event: true });
  }
}

// ---------- wiring ----------

// `initial` is the first route after the page loads: a reading kept on this device that
// matches the address is resumed rather than started again.
function route(initial = false) {
  let h;
  try { h = decodeURIComponent(location.hash.slice(1)); } catch { return showHome(); }
  if (!h) return showHome();
  if (h === 'journal') return showJournal();
  const kept = initial ? localReadings().filter(validEntry) : [];
  if (h.startsWith('r?')) {
    const params = new URLSearchParams(location.hash.slice(3));
    const e = !params.get('id') && kept.find(x => x.spread === params.get('s') &&
      String(x.variant) === (params.get('v') ?? '0') && x.placed.join('-') === params.get('c'));
    return e ? resumeLocal(e) : openSharedReading(params);
  }
  const [id, v = '0'] = h.split('/');
  const e = kept.find(x => x.spread === id && String(x.variant) === v && !entryDone(x));
  if (e) return resumeLocal(e);
  openSpread(id, Number(v));
}

document.querySelectorAll('dialog').forEach(d => {
  d.querySelector('.close').addEventListener('click', () => d.close());
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
});

$('browseButton').addEventListener('click', () => $('browseDialog').showModal());
$('coinButton').addEventListener('click', () => { $('coinDialog').showModal(); flipCoin(); });
$('flipAgain').addEventListener('click', flipCoin);
$('soundButton').addEventListener('click', toggleSound);
$('copyButton').addEventListener('click', () => copyText(readingText(), 'Reading copied.'));
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
renderDaily();
renderPicker();
renderBrowse();
detectServer().then(() => {
  route(true);
  saveKeptReadings();
});
