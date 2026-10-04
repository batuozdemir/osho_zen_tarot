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

function openSpread(id) {
  const s = spreads.find(sp => sp.id === id);
  if (!s) return showHome();
  setupSpread(s, 0);
  $('question').value = '';
  newReading();
  track(`Spread: ${s.name}`);
}

// Opens a finished reading from a link: #r?s=<spread>&v=<variant>&c=<cards>&q=<question>&id=<journal id>
function openSharedReading(params) {
  const s = spreads.find(sp => sp.id === params.get('s'));
  const cards = (params.get('c') || '').split('-').map(Number);
  if (!s) return showHome();
  setupSpread(s, Number(params.get('v')) || 0);
  const ps = positions();
  const valid = cards.length === ps.length && cards.every(n => n >= 1 && n <= TOTAL_CARDS) && new Set(cards).size === cards.length;
  if (!valid) return openSpread(s.id);
  placed = cards;
  deck = shuffle(Array.from({ length: TOTAL_CARDS }, (_, i) => i + 1).filter(n => !cards.includes(n)));
  cutDone = true;
  fanMode = 'fan';
  $('question').value = params.get('q') || '';
  readingId = params.get('id');
  interpretation = null;
  ownReading = false;
  renderBoard();
  renderFan();
  update();
  if (readingId && server.on) loadReading(readingId);
}

function showHome() {
  spread = null;
  showView('picker');
}

function newReading() {
  deck = shuffle(Array.from({ length: TOTAL_CARDS }, (_, i) => i + 1));
  placed = [];
  fanMode = 'fan';
  cutDone = false;
  readingId = null;
  interpretation = null;
  ownReading = false;
  history.replaceState(null, '', `#${spread.id}`);
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

function statusText() {
  const ps = positions();
  if (isDone()) {
    return server.on ? 'The spread is complete and saved to your journal.' : 'The spread is complete.';
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

  $('copyButton').disabled = !done;
  $('linkButton').disabled = !done;
  $('undoButton').disabled = placed.length === 0 || flying || !!interpretation ||
    (readingId && !ownReading) || (isParadox() && placed.length <= 2);
  if (done) history.replaceState(null, '', `#${shareHash()}`);
  renderSaved();
  renderInterpretation();
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
  setTimeout(() => {
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
    flying = true;
    const [top, bottom] = [inPile[inPile.length - 1], inPile[0]];
    cards.filter(c => !inPile.includes(c)).forEach(c => c.classList.add('leaving'));
    await place(top);
    await place(bottom);
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
  flying = true;
  place(cardEl).then(() => {
    flying = false;
    update();
    if (isDone()) saveReading();
  });
}

// Flies a card from the fan to the next empty position and flips it there.
function place(cardEl) {
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
      play('place');
      fillSlot(slot, n, true);
      flyer.remove();
      resolve();
    };
    flyer.addEventListener('transitionend', land, { once: true });
    setTimeout(land, 900);
  });
}

function undo() {
  if (flying || placed.length === 0 || interpretation || (readingId && !ownReading)) return;
  if (readingId) discardSaved();
  const n = placed.pop();
  deck.splice(randomInt(deck.length + 1), 0, n);
  history.replaceState(null, '', `#${spread.id}`);
  renderBoard();
  renderFan();
  update();
}

function changeVariant() {
  const before = positions().length;
  variantIndex = Number($('variantSelect').value);
  if (positions().length !== before || readingId) {
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
  $('journalLink').hidden = !server.on;
}

async function saveReading() {
  if (!server.on || readingId) return;
  try {
    const r = await api('readings', {
      method: 'POST',
      body: JSON.stringify({ spread: spread.id, variant: variantIndex, question: $('question').value.trim(), cards: placed, summary: readingText() }),
    });
    readingId = r.id;
    ownReading = true;
    update();
    startPolling();
  } catch {
    toast('Could not save to the journal.');
  }
}

function discardSaved() {
  const id = readingId;
  readingId = null;
  stopPolling();
  if (server.on && id) api(`readings/${id}`, { method: 'DELETE' }).catch(() => {});
}

let questionTimer = null;
function onQuestionInput() {
  if (isDone()) history.replaceState(null, '', `#${shareHash()}`);
  if (!readingId) return;
  clearTimeout(questionTimer);
  questionTimer = setTimeout(() => {
    api(`readings/${readingId}/question`, {
      method: 'PUT',
      body: JSON.stringify({ question: $('question').value.trim(), summary: readingText() }),
    }).catch(() => {});
  }, 700);
}

async function loadReading(id) {
  try {
    const r = await api(`readings/${id}`);
    if (readingId !== id) return;
    $('question').value = r.question;
    interpretation = r.interpretation ? { text: r.interpretation, at: r.interpreted_at } : null;
    update();
    if (!interpretation) startPolling();
  } catch {
    readingId = null;
    update();
  }
}

// While a saved reading waits for Claude, check for the interpretation every few seconds.
function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    if (!readingId || interpretation) return stopPolling();
    if (document.visibilityState !== 'visible') return;
    try {
      const r = await api(`readings/${readingId}`);
      if (r.interpretation) {
        interpretation = { text: r.interpretation, at: r.interpreted_at };
        stopPolling();
        update();
        toast("Claude's interpretation has arrived.");
        $('interpretation').scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth' });
      }
    } catch {}
  }, 5000);
}

function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
}

function renderSaved() {
  const note = $('savedNote');
  note.hidden = !readingId;
  if (readingId) note.textContent = interpretation ? 'Saved in your journal.' : 'Saved in your journal. Ask Claude to interpret your latest reading, and it appears here.';
}

function renderInterpretation() {
  const box = $('interpretation');
  box.hidden = !interpretation;
  if (!interpretation) return;
  $('interpretationMeta').textContent = `Claude · ${formatDate(interpretation.at)}`;
  $('interpretationText').innerHTML = renderMarkdown(interpretation.text);
}

async function showJournal() {
  if (!server.on) return showHome();
  spread = null;
  showView('journal');
  window.scrollTo(0, 0);
  $('journalSummary').textContent = 'Loading…';
  let readings;
  try {
    readings = await api('readings');
  } catch {
    $('journalSummary').textContent = 'The journal could not be loaded.';
    return;
  }
  renderPatterns(readings);
  renderJournalList(readings);
}

function readingLink(r) {
  const p = new URLSearchParams({ s: r.spread, v: r.variant, c: r.cards.join('-') });
  if (r.question) p.set('q', r.question);
  p.set('id', r.id);
  return `#r?${p}`;
}

function renderJournalList(readings) {
  const list = $('journalList');
  list.replaceChildren();
  readings.forEach(r => {
    const s = spreads.find(sp => sp.id === r.spread);
    const li = document.createElement('li');
    li.innerHTML = `
      <a class="journal-item">
        <span class="journal-meta"><span class="journal-date"></span><span class="journal-spread"></span></span>
        <span class="journal-question"></span>
        <span class="journal-cards"></span>
      </a>
      <button class="journal-delete" aria-label="Delete this reading"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>`;
    li.querySelector('a').href = readingLink(r);
    li.querySelector('.journal-date').textContent = formatDate(r.created_at, { day: 'numeric', month: 'short', year: 'numeric' });
    li.querySelector('.journal-spread').textContent = (s ? s.name : r.spread) + (r.interpretation ? ' · interpreted' : '');
    li.querySelector('.journal-question').textContent = r.question || 'No question';
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
  showJournal();
  toast('Reading deleted.', {
    label: 'Undo',
    run: async () => {
      await api(`readings/${id}/restore`, { method: 'POST' }).catch(() => {});
      showJournal();
    },
  });
}

// Suit shares against what an even draw would give, and the cards that keep returning.
function renderPatterns(readings) {
  const box = $('patterns');
  box.replaceChildren();
  const drawn = readings.flatMap(r => r.cards);
  if (!readings.length) {
    $('journalSummary').textContent = 'No readings yet. Finished readings are saved here automatically.';
    return;
  }
  const first = readings[readings.length - 1].created_at;
  $('journalSummary').textContent =
    `${readings.length} reading${readings.length > 1 ? 's' : ''}, ${drawn.length} cards drawn since ${formatDate(first)}.`;

  const suits = document.createElement('div');
  suits.className = 'pattern-block';
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
  box.appendChild(suits);

  const counts = new Map();
  readings.forEach(r => r.cards.forEach(n => {
    const c = counts.get(n) || { n, count: 0, last: r.created_at };
    c.count++;
    if (r.created_at > c.last) c.last = r.created_at;
    counts.set(n, c);
  }));
  const recurring = [...counts.values()].filter(c => c.count > 1).sort((a, b) => b.count - a.count || (b.last > a.last ? 1 : -1)).slice(0, 12);
  const rec = document.createElement('div');
  rec.className = 'pattern-block';
  rec.innerHTML = '<h2>Cards that keep coming back</h2>';
  if (!recurring.length) {
    rec.insertAdjacentHTML('beforeend', '<p class="pattern-note">No card has come up twice yet.</p>');
  } else {
    const grid = document.createElement('div');
    grid.className = 'recurring';
    recurring.forEach(c => {
      const b = document.createElement('button');
      b.className = 'recurring-card';
      b.innerHTML = '<img alt=""><span class="recurring-name"></span><span class="recurring-count"></span>';
      b.querySelector('img').src = cardThumb(c.n);
      b.querySelector('.recurring-name').textContent = cardName(c.n);
      b.querySelector('.recurring-count').textContent = `${c.count} times · last ${formatDate(c.last, { day: 'numeric', month: 'short' })}`;
      b.addEventListener('click', () => openCard(c.n, null));
      grid.appendChild(b);
    });
    rec.appendChild(grid);
  }
  box.appendChild(rec);
}

// ---------- copy for Claude ----------

// The reading as plain text with everything an assistant needs and nothing it has to look
// up: the question, the spread, a note on the deck, and each card's full Osho text and
// commentary. "Copy reading" gives it, and the journal stores the same text.
const DECK_NOTE = [
  'About the deck: the Osho Zen Tarot is about understanding the here and now, not predicting the future.',
  'The Major Arcana (0 to XXI, plus The Master) are the central themes of the spiritual journey; when one appears it carries special weight, and a reading without any suggests a passing chapter rather than a turning point.',
  'The four suits: Fire is action and response, following the gut; Water is the emotions, receptive; Clouds is the mind, which hides the light but comes and goes; Rainbows is the practical, material side of life, earth and spirit as one.',
].join(' ');

function readingText() {
  const ps = positions();
  const question = $('question').value.trim();
  const variant = spread.variants[variantIndex];
  const clean = t => t.replace(/\r\n/g, '\n').trim();
  const lines = [
    `Osho Zen Tarot reading, ${new Date().toISOString().slice(0, 10)}`,
    '',
    `Question: ${question || '(none; read it as a general reading for here and now)'}`,
    '',
    `Spread: ${spread.name}${variant.name ? ` (${variant.name})` : ''}`,
    spread.intro,
    '',
    DECK_NOTE,
    '',
    'Cards, by position:',
    ...ps.map((p, i) => `${i + 1}. ${p.label}: ${cardName(placed[i])} (${cardRank(placed[i])})`),
  ];
  ps.forEach((p, i) => {
    const n = placed[i];
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
    'a few short questions at a time, and wait for my answers before interpreting. Then read each ' +
    'card in the light of its position and of the texts above, and bring them together into one ' +
    'answer to the question. Afterwards, offer to go deeper into any card or any part of the ' +
    'answer. Reply in the language of the question.',
  );
  return lines.join('\n');
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

function openCard(n, positionIndex) {
  $('detailImage').src = cardImage(n);
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

function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (!h) return showHome();
  if (h === 'journal') return showJournal();
  if (h.startsWith('r?')) return openSharedReading(new URLSearchParams(location.hash.slice(3)));
  openSpread(h);
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
$('resetButton').addEventListener('click', newReading);
$('shuffleButton').addEventListener('click', shuffleDeck);
$('cutButton').addEventListener('click', cutDeck);
$('variantSelect').addEventListener('change', changeVariant);
$('question').addEventListener('input', onQuestionInput);
window.addEventListener('hashchange', route);
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
detectServer().then(route);
