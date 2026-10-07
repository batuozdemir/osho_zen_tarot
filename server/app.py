"""Tarot journal: serves the site and keeps readings plus their interpretations.

Tailnet only. Binds to localhost and `tailscale serve` exposes it, so the tailnet ACL
decides who gets in; there is no auth of its own (same reasoning as `transcribe`).
"""

from __future__ import annotations

import json
import os
import secrets
import sqlite3
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

SITE_DIR = Path(os.environ.get("TAROT_SITE_DIR", Path(__file__).resolve().parent.parent))
# The default lives outside the repo: the repo root is the served site when run locally,
# and a database inside it would be downloadable as a static file.
DB_PATH = Path(os.environ.get("TAROT_DB", Path.home() / ".local/share/tarot/journal.db"))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

SCHEMA = """
CREATE TABLE IF NOT EXISTS readings (
    id              TEXT PRIMARY KEY,
    created_at      TEXT NOT NULL,
    spread          TEXT NOT NULL,
    variant         INTEGER NOT NULL DEFAULT 0,
    question        TEXT NOT NULL DEFAULT '',
    cards           TEXT NOT NULL,            -- card numbers in position order, "12,45,3"
    interpretation  TEXT,
    interpreted_at  TEXT,
    summary         TEXT NOT NULL DEFAULT '',  -- the whole reading as plain text, card texts included
    deleted_at      TEXT,                      -- set by DELETE; the row stays so it can be restored
    impression      TEXT NOT NULL DEFAULT '',  -- Batu's first impression, written before the card texts
    deck            TEXT NOT NULL DEFAULT 'osho',  -- 'osho' (Osho Zen) or 'rws' (Rider-Waite); each has its own journal
    reversed        TEXT NOT NULL DEFAULT '',  -- "0,1,0" per card when reversals were in play, else empty
    rounds          TEXT NOT NULL DEFAULT '',  -- question by question: cards per question, "3,4,3"; its questions are the lines of `question`
    reshuffled      TEXT NOT NULL DEFAULT ''   -- question by question: the questions (from 0) before which the deck was made whole again, "2"
);
-- Dated notes written when coming back to a reading later.
CREATE TABLE IF NOT EXISTS notes (
    id          INTEGER PRIMARY KEY,
    reading_id  TEXT NOT NULL REFERENCES readings(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL,
    prompt      TEXT NOT NULL DEFAULT '',
    text        TEXT NOT NULL
);
-- An interpretation that a newer one replaced, kept behind the page's "Earlier version".
CREATE TABLE IF NOT EXISTS earlier_interpretations (
    id              INTEGER PRIMARY KEY,
    reading_id      TEXT NOT NULL REFERENCES readings(id) ON DELETE CASCADE,
    text            TEXT NOT NULL,
    interpreted_at  TEXT NOT NULL
);
"""


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")  # so purging a reading takes its notes with it
    return conn


with db() as conn:
    conn.executescript(SCHEMA)
    # Databases created before a column existed get it added in place.
    columns = {r["name"] for r in conn.execute("PRAGMA table_info(readings)")}
    if "summary" not in columns:
        conn.execute("ALTER TABLE readings ADD COLUMN summary TEXT NOT NULL DEFAULT ''")
    if "deleted_at" not in columns:
        conn.execute("ALTER TABLE readings ADD COLUMN deleted_at TEXT")
    if "impression" not in columns:
        conn.execute("ALTER TABLE readings ADD COLUMN impression TEXT NOT NULL DEFAULT ''")
    if "deck" not in columns:
        conn.execute("ALTER TABLE readings ADD COLUMN deck TEXT NOT NULL DEFAULT 'osho'")
    if "reversed" not in columns:
        conn.execute("ALTER TABLE readings ADD COLUMN reversed TEXT NOT NULL DEFAULT ''")
    if "rounds" not in columns:
        conn.execute("ALTER TABLE readings ADD COLUMN rounds TEXT NOT NULL DEFAULT ''")
    if "reshuffled" not in columns:
        conn.execute("ALTER TABLE readings ADD COLUMN reshuffled TEXT NOT NULL DEFAULT ''")


def purge(conn: sqlite3.Connection) -> None:
    """A deleted reading can be restored for 30 days, then it is gone.

    Run on every list, delete and restore rather than once at start, so a long-running
    service still forgets on time. Timestamps are ISO 8601 in UTC, so the cutoff is
    written the same way to compare as text."""
    conn.execute("DELETE FROM readings WHERE deleted_at < strftime('%Y-%m-%dT%H:%M:%S', 'now', '-30 days')")


with db() as conn:
    purge(conn)


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def row_to_dict(row: sqlite3.Row, notes: list[dict], earlier: list[dict]) -> dict:
    d = dict(row)
    d["cards"] = [int(c) for c in d["cards"].split(",") if c]
    d["reversed"] = [c == "1" for c in d["reversed"].split(",")] if d["reversed"] else None
    d["rounds"] = [int(c) for c in d["rounds"].split(",")] if d["rounds"] else None
    d["reshuffled"] = [int(c) for c in d["reshuffled"].split(",")] if d["reshuffled"] else []
    d.pop("deleted_at", None)
    d["notes"] = notes
    d["earlier"] = earlier
    return d


def notes_by_reading(conn: sqlite3.Connection, ids: list[str]) -> dict[str, list[dict]]:
    """Notes oldest first, so they read as a timeline."""
    out: dict[str, list[dict]] = {i: [] for i in ids}
    marks = ",".join("?" * len(ids))
    for r in conn.execute(f"SELECT * FROM notes WHERE reading_id IN ({marks}) ORDER BY created_at, id", ids):
        out[r["reading_id"]].append({"id": r["id"], "created_at": r["created_at"], "prompt": r["prompt"], "text": r["text"]})
    return out


def earlier_by_reading(conn: sqlite3.Connection, ids: list[str]) -> dict[str, list[dict]]:
    """Replaced interpretations, newest first."""
    out: dict[str, list[dict]] = {i: [] for i in ids}
    marks = ",".join("?" * len(ids))
    for r in conn.execute(
        f"SELECT * FROM earlier_interpretations WHERE reading_id IN ({marks}) ORDER BY interpreted_at DESC, id DESC", ids
    ):
        out[r["reading_id"]].append({"text": r["text"], "interpreted_at": r["interpreted_at"]})
    return out


def with_children(conn: sqlite3.Connection, rows: list[sqlite3.Row]) -> list[dict]:
    ids = [r["id"] for r in rows]
    if not ids:
        return []
    notes, earlier = notes_by_reading(conn, ids), earlier_by_reading(conn, ids)
    return [row_to_dict(r, notes[r["id"]], earlier[r["id"]]) for r in rows]


def get_row(conn: sqlite3.Connection, reading_id: str, deleted: bool = False) -> dict:
    row = conn.execute(
        f"SELECT * FROM readings WHERE id = ? AND deleted_at IS {'NOT ' if deleted else ''}NULL", (reading_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(404, "no such reading")
    return with_children(conn, [row])[0]


# Cards per deck; card numbers run from 1 to this.
DECK_SIZE = {"osho": 79, "rws": 78}
# A sitting whose deck is made whole again can outgrow one deck; the summary carries every
# card's full text.
MAX_CARDS = 300
MAX_SUMMARY = 2_000_000


class NewReading(BaseModel):
    deck: Literal["osho", "rws"] = "osho"
    spread: str = Field(max_length=64)
    variant: int = Field(default=0, ge=0, le=64)
    question: str = Field(default="", max_length=4000)
    impression: str = Field(default="", max_length=4000)
    cards: list[int] = Field(min_length=1, max_length=MAX_CARDS)
    # One flag per card when reversals were in play (Rider-Waite only); left out otherwise.
    reversed: list[bool] | None = None
    # Question by question: how many cards each question got, in order; left out otherwise.
    rounds: list[int] | None = Field(default=None, max_length=MAX_CARDS)
    # Question by question: the questions before which the deck was made whole again, so a
    # card may come up again in a later question.
    reshuffled: list[int] = Field(default=[], max_length=MAX_CARDS)
    summary: str = Field(default="", max_length=MAX_SUMMARY)
    # When the spread was completed; the page sends it so that a reading kept on the device
    # while the journal was out of reach is saved under the day it was drawn.
    created_at: datetime | None = None


class Edit(BaseModel):
    """The parts of a reading Batu writes himself, and its cards when they changed after it
    was saved; a field left out stays as it is. `cards` comes with `reversed`, `rounds`,
    `reshuffled` and `summary` as they now are, and with `base`: the cards the change starts
    from, which must still be the saved ones."""
    question: str | None = Field(default=None, max_length=4000)
    impression: str | None = Field(default=None, max_length=4000)
    summary: str | None = Field(default=None, max_length=MAX_SUMMARY)
    cards: list[int] | None = Field(default=None, min_length=1, max_length=MAX_CARDS)
    reversed: list[bool] | None = None
    rounds: list[int] | None = Field(default=None, max_length=MAX_CARDS)
    reshuffled: list[int] = Field(default=[], max_length=MAX_CARDS)
    base: list[int] | None = Field(default=None, max_length=MAX_CARDS)


def check_cards(deck: str, cards: list[int], reversed_: list[bool] | None, rounds: list[int] | None, reshuffled: list[int]) -> None:
    """Cards are distinct, except across a question-by-question reading's reshuffles."""
    size = DECK_SIZE[deck]
    if any(not 1 <= c <= size for c in cards):
        raise HTTPException(422, f"cards must be numbers from 1 to {size}")
    if reversed_ is not None and (deck != "rws" or len(reversed_) != len(cards)):
        raise HTTPException(422, "reversed needs the Rider-Waite deck and one flag per card")
    if rounds is not None and (any(n < 1 for n in rounds) or sum(rounds) != len(cards)):
        raise HTTPException(422, "rounds must be positive card counts adding up to the cards")
    if reshuffled and (rounds is None or any(not 0 < q < len(rounds) for q in reshuffled)):
        raise HTTPException(422, "reshuffled must name questions after the first")
    # Between reshuffles the cards come from one deck, so none can repeat there.
    starts = [0] + [sum(rounds[:q]) for q in sorted(set(reshuffled))] + [len(cards)] if rounds else [0, len(cards)]
    if any(len(set(cards[a:b])) != b - a for a, b in zip(starts, starts[1:])):
        raise HTTPException(422, "cards must be distinct between reshuffles")


class Note(BaseModel):
    prompt: str = Field(default="", max_length=200)
    text: str = Field(min_length=1, max_length=20_000)
    # Only the page's Undo sends this, to put a deleted note back where it was.
    created_at: datetime | None = None


class Interpretation(BaseModel):
    text: str = Field(min_length=1, max_length=100_000)


def stamp(t: datetime | None) -> str:
    """ISO 8601 in UTC to the second, the one form every timestamp here is stored in."""
    if t is None:
        return now()
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    return t.astimezone(timezone.utc).isoformat(timespec="seconds")


app = FastAPI(title="tarot")


@app.get("/api/health")
def health() -> dict:
    # `jev` tells the page whether to offer "Ask Jev which spread" on the home page.
    return {"ok": True, "jev": bool(OPENROUTER_KEY)}


# Jev (TypeSafe, through OpenRouter) is a decision model: given the question and the
# spreads with their descriptions, it returns a probability for each spread, adding up to 1.
# One yes/no question per spread was tried instead (2026-10-07) and dropped: the general
# spreads (Celtic Cross, Three Card, the Diamond) then scored high on nearly every question.
# The key stays here on the server; on the host it comes from /etc/tarot/openrouter.env.
OPENROUTER_KEY = os.environ.get("OPENROUTER_API_KEY", "")
JEV_MODEL = os.environ.get("TAROT_JEV_MODEL", "typesafe/jev-1.13")


class Recommend(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    deck: str = Field(default="", max_length=64)
    # Spread id -> what the spread is and what to use it for, for the spreads of the deck in use.
    spreads: dict[str, str] = Field(min_length=2, max_length=64)


@app.post("/api/recommend")
def recommend(body: Recommend) -> dict:
    if not OPENROUTER_KEY:
        raise HTTPException(503, "Jev is not set up on this server")
    request = urllib.request.Request(
        "https://openrouter.ai/api/v1/systemone",
        data=json.dumps({
            "model": JEV_MODEL,
            "state": {"deck": body.deck, "question": body.question},
            "questions": {
                "spread": {
                    "type": "choice",
                    "instructions": "Which tarot spread best suits asking the question in `question`?",
                    "criteria": body.spreads,
                },
            },
        }).encode(),
        headers={"Authorization": f"Bearer {OPENROUTER_KEY}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as res:
            answer = json.load(res)["answers"]["spread"]
    except (urllib.error.URLError, TimeoutError, KeyError, ValueError) as e:
        raise HTTPException(502, f"Jev did not answer: {e}") from e
    return {"probabilities": answer["probabilities"], "confidence": answer.get("confidence")}


@app.get("/api/readings")
def list_readings(limit: int | None = None) -> list[dict]:
    """All readings, newest first; `limit` caps the count when only the latest are needed."""
    with db() as conn:
        purge(conn)
        rows = conn.execute(
            "SELECT * FROM readings WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ?",
            (limit if limit and limit > 0 else -1,),
        ).fetchall()
        return with_children(conn, rows)


@app.get("/api/readings/{reading_id}")
def get_reading(reading_id: str) -> dict:
    with db() as conn:
        return get_row(conn, reading_id)


def card_columns(cards: list[int], reversed_: list[bool] | None, rounds: list[int] | None, reshuffled: list[int]) -> dict:
    return {
        "cards": ",".join(str(c) for c in cards),
        "reversed": ",".join("1" if r else "0" for r in reversed_) if reversed_ is not None else "",
        "rounds": ",".join(str(n) for n in rounds) if rounds is not None else "",
        "reshuffled": ",".join(str(q) for q in sorted(set(reshuffled))),
    }


@app.post("/api/readings", status_code=201)
def create_reading(body: NewReading) -> dict:
    check_cards(body.deck, body.cards, body.reversed, body.rounds, body.reshuffled)
    created = stamp(body.created_at)
    # Filed under the day where it was drawn: the page sends its local offset.
    day = body.created_at.date().isoformat() if body.created_at else created[:10]
    reading_id = f"{day}-{secrets.token_hex(3)}"
    c = card_columns(body.cards, body.reversed, body.rounds, body.reshuffled)
    with db() as conn:
        conn.execute(
            "INSERT INTO readings (id, created_at, deck, spread, variant, question, impression, cards, reversed, rounds, reshuffled, summary)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (reading_id, created, body.deck, body.spread, body.variant, body.question, body.impression,
             c["cards"], c["reversed"], c["rounds"], c["reshuffled"], body.summary),
        )
        return get_row(conn, reading_id)


@app.patch("/api/readings/{reading_id}")
@app.put("/api/readings/{reading_id}/question")  # the earlier name, for a page still open from before
def edit_reading(reading_id: str, body: Edit) -> dict:
    with db() as conn:
        row = get_row(conn, reading_id)
        if body.cards is not None:
            missing = {"reversed", "rounds", "reshuffled", "summary", "base"} - body.model_fields_set
            if missing:
                raise HTTPException(422, f"cards come with {', '.join(sorted(missing))}")
            if row["spread"] == "session" and (body.rounds is None or any(n < 3 for n in body.rounds)):
                raise HTTPException(422, "a question-by-question reading needs rounds of three cards or more")
            check_cards(row["deck"], body.cards, body.reversed, body.rounds, body.reshuffled)
            # Changed meanwhile in another tab or on another device: that change is not overwritten.
            if body.base != row["cards"]:
                raise HTTPException(409, "the reading's cards changed since this change began")
            c = card_columns(body.cards, body.reversed, body.rounds, body.reshuffled)
            conn.execute(
                "UPDATE readings SET cards = ?, reversed = ?, rounds = ?, reshuffled = ? WHERE id = ?",
                (c["cards"], c["reversed"], c["rounds"], c["reshuffled"], reading_id),
            )
        for field in ("question", "impression", "summary"):
            value = getattr(body, field)
            if value is not None:
                conn.execute(f"UPDATE readings SET {field} = ? WHERE id = ?", (value, reading_id))
        return get_row(conn, reading_id)


@app.get("/api/readings/{reading_id}/interpretation")
def get_interpretation(reading_id: str) -> dict:
    """Just the interpretation, for the page to poll without fetching the card texts again."""
    with db() as conn:
        r = get_row(conn, reading_id)
    return {"interpretation": r["interpretation"], "interpreted_at": r["interpreted_at"], "earlier": r["earlier"]}


@app.put("/api/readings/{reading_id}/interpretation")
def set_interpretation(reading_id: str, body: Interpretation) -> dict:
    with db() as conn:
        r = get_row(conn, reading_id)
        if r["interpretation"] and r["interpretation"] != body.text:
            conn.execute(
                "INSERT INTO earlier_interpretations (reading_id, text, interpreted_at) VALUES (?, ?, ?)",
                (reading_id, r["interpretation"], r["interpreted_at"] or now()),
            )
        conn.execute(
            "UPDATE readings SET interpretation = ?, interpreted_at = ? WHERE id = ?",
            (body.text, now(), reading_id),
        )
        return get_row(conn, reading_id)


@app.delete("/api/readings/{reading_id}", status_code=204)
def delete_reading(reading_id: str) -> None:
    with db() as conn:
        purge(conn)
        get_row(conn, reading_id)
        conn.execute("UPDATE readings SET deleted_at = ? WHERE id = ?", (now(), reading_id))


@app.post("/api/readings/{reading_id}/restore")
def restore_reading(reading_id: str) -> dict:
    with db() as conn:
        purge(conn)
        get_row(conn, reading_id, deleted=True)
        conn.execute("UPDATE readings SET deleted_at = NULL WHERE id = ?", (reading_id,))
        return get_row(conn, reading_id)


@app.post("/api/readings/{reading_id}/notes", status_code=201)
def add_note(reading_id: str, body: Note) -> dict:
    created = stamp(body.created_at)
    with db() as conn:
        get_row(conn, reading_id)
        cur = conn.execute(
            "INSERT INTO notes (reading_id, created_at, prompt, text) VALUES (?, ?, ?, ?)",
            (reading_id, created, body.prompt, body.text),
        )
    return {"id": cur.lastrowid, "created_at": created, "prompt": body.prompt, "text": body.text}


@app.delete("/api/readings/{reading_id}/notes/{note_id}", status_code=204)
def delete_note(reading_id: str, note_id: int) -> None:
    with db() as conn:
        get_row(conn, reading_id)
        if conn.execute("DELETE FROM notes WHERE id = ? AND reading_id = ?", (note_id, reading_id)).rowcount == 0:
            raise HTTPException(404, "no such note")


# Last, so the API routes above win.
app.mount("/", StaticFiles(directory=SITE_DIR, html=True), name="site")
