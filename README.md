# Osho Zen Tarot

A small site for drawing tarot spreads with two decks: the Osho Zen Tarot and the classic
Rider-Waite-Smith deck (1909). A switch in the top bar changes the whole site to the other
deck (card of the day, browsing, spreads and journal); the choice is remembered on the
device. With the Osho Zen deck there are 14 spreads; with Rider-Waite the five that are not
specific to the Osho guidebook (single card, three cards, Celtic Cross in Waite's own form,
horseshoe, decision). Both decks have "Question by Question": not a layout but a sitting, the
way a reader works. Each question in turn gets three cards, then optional clarifiers (one more
card that sheds light on the three, often drawn when they are all Major Arcana), all from
the same deck without reshuffling, until the reading is finished by hand. Before a question's
first card, "Reset the deck" makes the deck whole again and reshuffles it, so a card may come
up again; the reading records before which questions that happened. A sitting can be copied
before it is finished: "Copy reading" gives the questions so far with everything an outside
assistant needs, including how the sitting works (it may ask for a clarifier for the last
question), and the "Copy" on each question's tag above its cards, or beside it in the list,
gives just that question and its cards, to paste into the same conversation.

Any complete reading can be taken up again, also one opened from the journal: "Continue the
sitting" for more questions or clarifiers, "Draw a clarifier" for a fixed spread (one more
card under the spread, with its own Copy for the same conversation). A saved reading stays in
the journal meanwhile and is updated in place once it is complete again; while it is being
added to it is kept on the device, so a reload resumes it. Undo takes back only what was
added when Claude or Batu has already written about the reading (an interpretation or a
note); otherwise the whole reading can be undone card by card. Rider-Waite readings can use reversed cards: a "Reversed cards"
button next to Shuffle turns them on before the first card, and each card then comes up
upright or reversed at random.

Pick a spread, shuffle and cut
the deck, pick cards from a face-down fan, and each card flies into its position. Once
the spread is complete, an optional field asks for a first impression before the card
texts are read. A finished reading is saved to the journal (tailnet copy), where Claude
can pick it up and interpret it without any copying; on the public copy it can be copied
as plain text for any assistant. Under the interpretation, dated "coming back to this"
notes can be added later.

A reading in progress is kept in the browser's local storage, so a closed tab or a
reload resumes it (the home page lists it under "On this device"). On the tailnet copy a
finished reading that could not be saved (offline, server down) stays there too, marked
"Not yet saved to journal", and is saved with its original date the next time the page
loads with the journal reachable. The home page also has a "Use again" row of the last
few spreads finished on that device.

On the tailnet copy, above the spread tiles, a box asks Jev which spread fits a question.
Jev (TypeSafe's decision model, called through OpenRouter by the server, never by the
page) gets the question and every spread of the deck in use with its tile description,
and returns a probability for each, adding up to 100%; the likely ones are listed with
their scores, and opening one of them carries the question into the reading. When two
spreads both fit, the probability is split between them. An independent score per spread
was tried on 23 questions in English and Turkish (2026-10-07) and dropped: the general
spreads (Celtic Cross, Three Card, the Diamond) scored high on nearly every personal
question, so the list stopped telling them apart. The box only appears when the
server has an OpenRouter key.

It runs in two places from the same code:

- **GitHub Pages** (public): everything except the journal.
- **vps-oci-1, tailnet only**: the same site plus the journal, served by `server/app.py`.
  The page asks `api/health` on load and turns the journal on only where it answers.

## What is where

| Path | What |
|---|---|
| `index.html`, `styles.css`, `script.js` | The whole front end, no build step |
| `js/cardData.js` | Card names, Osho texts and commentaries, keyed by card number 1–79 |
| `js/rwsData.js` | Rider-Waite card names with upright and reversed meanings, card numbers 1–78 (written for this site) |
| `js/spreads.js` | The spreads: positions, their meanings, coordinates in card units, and which deck offers them |
| `assets/CardPictures/` | Full-size card images (Adobe RGB, with their profile); `small/` holds the 420px WebP copies used everywhere but the detail view, converted to sRGB (`cwebp -q 78 -m 6 -sharp_yuv`) |
| `assets/rws/` | Rider-Waite card images, the same way (1909 scans from Wikimedia Commons, public domain, padded to 2:3) |
| `assets/CardText/`, `assets/CardCommentary/` | The same texts as plain files, for Claude to read |
| `assets/UserGuide/guide.md` | The deck's guidebook: suits, symbols, how to ask |
| `assets/sounds/` | Sound effects, trimmed and levelled from CC0 recordings (credits below) |
| `sw.js`, `manifest.webmanifest`, `assets/icons/` | Offline use and installing on a phone's home screen |
| `server/` | The journal server, its systemd unit, and the deploy script |

Osho Zen: cards 1–23 are the Major Arcana (with The Master), then Clouds 24–37, Fire
38–51, Rainbows 52–65 and Water 66–79. The numbers are file order, not deck order; the
rank of each card is in the `ranks` table in `script.js`. Rider-Waite: 1–22 are the Major
Arcana (The Fool to The World), then Wands 23–36, Cups 37–50, Swords 51–64 and Pentacles
65–78, each Ace to King. Everything that differs between the decks is in `DECKS` in
`script.js`.

## Running it locally

```sh
cd server
uv venv && uv pip install fastapi uvicorn
TAROT_DB=/tmp/journal-dev.db .venv/bin/uvicorn app:app --port 8765   # default: ~/.local/share/tarot/
```

Then open http://127.0.0.1:8765. To try "Ask Jev", start it with `OPENROUTER_API_KEY` set
(`TAROT_JEV_MODEL` overrides the model, `typesafe/jev-1.13` by default). Without the server, any static file server works too;
the journal simply stays hidden.

## Deploying

`server/deploy.sh` copies the site and the server to `vps-oci-1` and restarts the
service. It is safe to rerun and never touches the database. The journal lives in
`/var/lib/tarot/journal.db` (SQLite) on that host. The OpenRouter key for "Ask Jev" is
not deployed: it is put by hand in `/etc/tarot/openrouter.env` (`OPENROUTER_API_KEY=...`,
root-only, 0600), which the systemd unit reads if it exists. Host-side details are recorded in
`~/Workspace/infra/hosts/vps-oci-1/host.md`.

GitHub Pages deploys itself from `main` on push.

## The journal API

No auth: the service binds to localhost and only `tailscale serve` exposes it, so the
tailnet ACL decides who gets in.

| Method | Path | Body | What |
|---|---|---|---|
| GET | `api/health` | | `{"ok": true, "jev": bool}`; `jev` is whether an OpenRouter key is set |
| POST | `api/recommend` | `{"question", "deck"?, "spreads": {id: description}}` | Asks Jev which spread suits the question; returns `{"probabilities": {id: p}, "confidence"}`, the probabilities adding up to 1. 503 without a key, 502 when Jev does not answer |
| GET | `api/readings` | | All readings, newest first (`?limit=n` for only the latest) |
| GET | `api/readings/{id}` | | One reading |
| POST | `api/readings` | `{"deck"?, "spread", "variant", "question", "impression", "cards": [n, ...], "reversed"?, "rounds"?, "reshuffled"?, "summary", "created_at"?}` | Saves a finished reading; `deck` is `osho` (default) or `rws`, `reversed` one flag per card when reversals were in play, `rounds` the cards per question of a question-by-question reading, `reshuffled` the questions (from 0) before which its deck was made whole again, `created_at` when it was drawn, with the page's local offset so the id carries the local day |
| PATCH | `api/readings/{id}` | `{"question"?, "impression"?, "summary"?, "cards"?, "reversed"?, "rounds"?, "reshuffled"?}` | Updates what Batu wrote (and the summary that quotes it), and the cards of a reading taken up again (`cards` comes with the other three as they now are); `PUT api/readings/{id}/question` is the old name |
| GET | `api/readings/{id}/interpretation` | | The interpretation, its time and the earlier versions; what an open page polls |
| PUT | `api/readings/{id}/interpretation` | `{"text"}` (Markdown) | Saves Claude's interpretation; a different text moves the previous one to `earlier`. An open page picks it up within seconds |
| POST | `api/readings/{id}/notes` | `{"prompt", "text"}` | Adds a dated "coming back to this" note |
| DELETE | `api/readings/{id}/notes/{note_id}` | | Deletes a note (the page's Undo posts it again with its `created_at`) |
| DELETE | `api/readings/{id}` | | Deletes a reading; it can be restored for 30 days, then it is purged (checked on every list, delete and restore) |
| POST | `api/readings/{id}/restore` | | Brings a deleted reading back (the page's Undo) |

`cards` are card numbers in position order, in the reading's `deck` (`osho` or `rws`; each
deck has its own journal on the page, the API lists both); a fixed spread's cards beyond its
positions are clarifiers drawn after it was complete. No card repeats, except across a
question-by-question reading's reshuffles. `reversed` is a list of
booleans per card, or null when reversals were off. `rounds` is null except for a
question-by-question reading (`spread: "session"`): the number of cards each question got,
in order, the first three of each being its cards and any more its clarifiers; its
`question` then holds every question, one line each. `summary` is the whole reading as
plain text: question, first impression, spread, a note on the deck, and every position
with its card's full text (Osho's text and commentary, or the Rider-Waite meaning, with
the reversed meaning first for a reversed card). It is the same text the "Copy reading" button
gives, written so that a chat assistant with no other context can interpret it. A
reading also carries `impression` (Batu's own words, written before the card texts),
`notes` (oldest first: `created_at`, `prompt`, `text`) and `earlier` (replaced
interpretations, newest first).

## Interpreting a reading (for Claude)

When Batu asks for a reading to be interpreted ("my latest reading", "the one about…"),
or asks Claude to do a reading:

1. `GET api/readings` on the journal and pick the one he means; newest is first.
2. Its `summary` holds everything: the question, the spread, and every position with its
   card's full text. Check its `deck`. For an Osho Zen reading the guidebook
   (`assets/UserGuide/guide.md`) adds the symbols. A Rider-Waite reading is read in that
   deck's own tradition, and a reversed card (marked in the summary) as the card's energy
   blocked, turned inward or delayed rather than simply negative. Earlier readings in the
   journal can be drawn on when a card or theme recurs (within the same deck: card
   numbers mean different cards in the two decks). If there is an `impression`, start from it: it is what Batu saw in the cards
   before any explanation. His `notes` say what stayed, what changed and what did not
   fit when he came back to a reading; read them before a follow-up.
3. **Make it a conversation, not a verdict.** If the question is unclear, or the cards
   need more context about his situation to be read well, ask first: a few short
   questions at a time, then wait for the answers before interpreting.
4. Read each card in its position, then bring them together into one answer to the
   question, in the language of the question. For big spreads (six cards or more) give
   a short synthesis, one or two tensions between the cards and a question back, instead
   of an essay on every card. Treat the cards and Osho's words as a mirror for
   reflection, not as facts, predictions or medical and psychological diagnoses;
   positions about the future or past lives are read the same way. Other-person
   positions are lenses, not mind-reading. A mismatch is information, not resistance:
   when a card does not fit, ask what the gap shows. Afterwards, offer to go deeper into
   any card or part of the answer.
5. `PUT api/readings/{id}/interpretation` with `{"text": "<Markdown>"}` once the
   interpretation is settled (again if a follow-up changes it; the page keeps the
   previous one behind "Earlier version"). The open page shows it within seconds. Give
   the interpretation in the chat too.

The "Copy reading" text asks an outside assistant to work the same way.

## Credits

Rider-Waite-Smith card images: Pamela Colman Smith, 1909 ("Roses and Lilies" edition), public
domain, scans from Wikimedia Commons (https://commons.wikimedia.org/wiki/Category:Rider-Waite_tarot_deck_(Roses_%26_Lilies)).

Sound effects, all CC0 (public domain), trimmed and levelled for the site:

- Card shuffle, fan, slide, place and push: *Casino Audio* by Kenney, https://kenney.nl/assets/casino-audio
- Coin flick: *Coin Sounds* by syncopika, https://opengameart.org/node/33019
- Coin landing: *Coin Drop* by Vinrax, https://opengameart.org/content/coin-drop
