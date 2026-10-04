# Osho Zen Tarot

A small site for drawing Osho Zen Tarot spreads. Pick one of 13 spreads, shuffle and cut
the deck, pick cards from a face-down fan, and each card flies into its position. A
finished reading is saved to the journal (tailnet copy), where Claude can pick it up and
interpret it without any copying; on the public copy it can be copied as plain text for
any assistant.

It runs in two places from the same code:

- **GitHub Pages** (public): everything except the journal.
- **vps-oci-1, tailnet only**: the same site plus the journal, served by `server/app.py`.
  The page asks `api/health` on load and turns the journal on only where it answers.

## What is where

| Path | What |
|---|---|
| `index.html`, `styles.css`, `script.js` | The whole front end, no build step |
| `js/cardData.js` | Card names, Osho texts and commentaries, keyed by card number 1–79 |
| `js/spreads.js` | The spreads: positions, their meanings, and coordinates in card units |
| `assets/CardPictures/` | Full-size card images; `small/` holds the 420px WebP copies used everywhere but the detail view |
| `assets/CardText/`, `assets/CardCommentary/` | The same texts as plain files, for Claude to read |
| `assets/UserGuide/guide.md` | The deck's guidebook: suits, symbols, how to ask |
| `sw.js`, `manifest.webmanifest`, `assets/icons/` | Offline use and installing on a phone's home screen |
| `server/` | The journal server, its systemd unit, and the deploy script |

Cards 1–23 are the Major Arcana (with The Master), then Clouds 24–37, Fire 38–51,
Rainbows 52–65 and Water 66–79. The numbers are file order, not deck order; the rank of
each card is in the `ranks` table in `script.js`.

## Running it locally

```sh
cd server
uv venv && uv pip install fastapi uvicorn
TAROT_DB=/tmp/journal-dev.db .venv/bin/uvicorn app:app --port 8765
```

Then open http://127.0.0.1:8765. Without the server, any static file server works too;
the journal simply stays hidden.

## Deploying

`server/deploy.sh` copies the site and the server to `vps-oci-1` and restarts the
service. It is safe to rerun and never touches the database. The journal lives in
`/var/lib/tarot/journal.db` (SQLite) on that host. Host-side details are recorded in
`~/Workspace/infra/hosts/vps-oci-1/host.md`.

GitHub Pages deploys itself from `main` on push.

## The journal API

No auth: the service binds to localhost and only `tailscale serve` exposes it, so the
tailnet ACL decides who gets in.

| Method | Path | Body | What |
|---|---|---|---|
| GET | `api/health` | | `{"ok": true}` |
| GET | `api/readings` | | All readings, newest first |
| GET | `api/readings/{id}` | | One reading |
| POST | `api/readings` | `{"spread", "variant", "question", "cards": [n, ...], "summary"}` | Saves a finished reading |
| PUT | `api/readings/{id}/question` | `{"question", "summary"}` | Updates the question (and the summary that quotes it) |
| PUT | `api/readings/{id}/interpretation` | `{"text"}` (Markdown) | Saves Claude's interpretation; the open page picks it up within seconds |
| DELETE | `api/readings/{id}` | | Deletes a reading |

`cards` are card numbers in position order. `summary` is the whole reading as plain text:
question, spread, a note on the deck, and every position with its card's full Osho text
and commentary. It is the same text the "Copy reading" button gives, written so that a
chat assistant with no other context can interpret it.

## Interpreting a reading (for Claude)

When Batu asks for a reading to be interpreted ("my latest reading", "the one about…"),
or asks Claude to do a reading:

1. `GET api/readings` on the journal and pick the one he means; newest is first.
2. Its `summary` holds everything: the question, the spread, and every position with its
   card's full text and commentary. The guidebook (`assets/UserGuide/guide.md`) adds
   the symbols, and earlier readings in the journal can be drawn on when a card or theme
   recurs.
3. **Make it a conversation, not a verdict.** If the question is unclear, or the cards
   need more context about his situation to be read well, ask first: a few short
   questions at a time, then wait for the answers before interpreting.
4. Read each card in its position, then bring them together into one answer to the
   question, in the language of the question. Afterwards, offer to go deeper into any
   card or part of the answer.
5. `PUT api/readings/{id}/interpretation` with `{"text": "<Markdown>"}` once the
   interpretation is settled (again if a follow-up changes it). The open page shows it
   within seconds. Give the interpretation in the chat too.

The "Copy reading" text asks an outside assistant to work the same way.
