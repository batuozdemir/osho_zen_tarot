"""Tarot journal: serves the site and keeps readings plus their interpretations.

Tailnet only. Binds to localhost and `tailscale serve` exposes it, so the tailnet ACL
decides who gets in; there is no auth of its own (same reasoning as `transcribe`).
"""

from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

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
    deleted_at      TEXT                       -- set by DELETE; the row stays so it can be restored
)
"""


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


with db() as conn:
    conn.execute(SCHEMA)
    # Databases created before a column existed get it added in place.
    columns = {r["name"] for r in conn.execute("PRAGMA table_info(readings)")}
    if "summary" not in columns:
        conn.execute("ALTER TABLE readings ADD COLUMN summary TEXT NOT NULL DEFAULT ''")
    if "deleted_at" not in columns:
        conn.execute("ALTER TABLE readings ADD COLUMN deleted_at TEXT")


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


def row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["cards"] = [int(c) for c in d["cards"].split(",") if c]
    d.pop("deleted_at", None)
    return d


def get_row(conn: sqlite3.Connection, reading_id: str, deleted: bool = False) -> dict:
    row = conn.execute(
        f"SELECT * FROM readings WHERE id = ? AND deleted_at IS {'NOT ' if deleted else ''}NULL", (reading_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(404, "no such reading")
    return row_to_dict(row)


class NewReading(BaseModel):
    spread: str = Field(max_length=64)
    variant: int = Field(default=0, ge=0, le=64)
    question: str = Field(default="", max_length=4000)
    cards: list[int] = Field(min_length=1, max_length=79)
    summary: str = Field(default="", max_length=200_000)


class Question(BaseModel):
    question: str = Field(max_length=4000)
    summary: str | None = Field(default=None, max_length=200_000)


class Interpretation(BaseModel):
    text: str = Field(min_length=1, max_length=100_000)


app = FastAPI(title="tarot")


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.get("/api/readings")
def list_readings(limit: int = 500) -> list[dict]:
    with db() as conn:
        purge(conn)
        rows = conn.execute(
            "SELECT * FROM readings WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ?", (min(limit, 5000),)
        ).fetchall()
    return [row_to_dict(r) for r in rows]


@app.get("/api/readings/{reading_id}")
def get_reading(reading_id: str) -> dict:
    with db() as conn:
        return get_row(conn, reading_id)


@app.post("/api/readings", status_code=201)
def create_reading(body: NewReading) -> dict:
    if any(not 1 <= c <= 79 for c in body.cards) or len(set(body.cards)) != len(body.cards):
        raise HTTPException(422, "cards must be distinct numbers from 1 to 79")
    created = now()
    reading_id = f"{created[:10]}-{secrets.token_hex(3)}"
    with db() as conn:
        conn.execute(
            "INSERT INTO readings (id, created_at, spread, variant, question, cards, summary) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (reading_id, created, body.spread, body.variant, body.question,
             ",".join(str(c) for c in body.cards), body.summary),
        )
        return get_row(conn, reading_id)


@app.put("/api/readings/{reading_id}/question")
def set_question(reading_id: str, body: Question) -> dict:
    with db() as conn:
        get_row(conn, reading_id)
        conn.execute("UPDATE readings SET question = ? WHERE id = ?", (body.question, reading_id))
        if body.summary is not None:
            conn.execute("UPDATE readings SET summary = ? WHERE id = ?", (body.summary, reading_id))
        return get_row(conn, reading_id)


@app.put("/api/readings/{reading_id}/interpretation")
def set_interpretation(reading_id: str, body: Interpretation) -> dict:
    with db() as conn:
        get_row(conn, reading_id)
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


# Last, so the API routes above win.
app.mount("/", StaticFiles(directory=SITE_DIR, html=True), name="site")
