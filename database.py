"""
database.py — AI-901 Exam Simulator Question Bank & Schema Seeder
=================================================================

PURPOSE
-------
This module is the single source of truth for:
  1. The SQLite database schema (4 tables)
  2. The 210-question pool, seeded into the `questions` table on first run

USAGE
-----
Called automatically by server.py at startup:
    import database
    database.init_db()           # creates schema + seeds questions
    database.init_db(force_reseed=False)  # creates schema only, no re-seed

Can also be run standalone to reset the database:
    python3 database.py

SCHEMA SUMMARY
--------------
  questions       — the pool of 210 exam items
  exam_sessions   — one row per active or submitted exam
  responses       — one row per user answer, per session
  history         — one graded summary row per submitted attempt

ADDING QUESTIONS
----------------
See CONTRIBUTING.md for full annotated schemas for all 5 question types:
  single-choice | multi-choice | true-false-matrix | dropdown-hotspot | drag-drop

Quick rules:
  - id:             Unique string, continue the Q-series (e.g. 'Q211')
  - objective:      'Objective 1' or 'Objective 2' exactly
  - difficulty:     'easy', 'medium', or 'hard' (lowercase)
  - type:           one of the 5 type strings above
  - options:        JSON-serialisable list (or dict for drag-drop)
  - correct_answer: string for single-choice, list for all others
  - explanations:   dict with keys: correct, incorrect, concept
  - avg_time:       expected seconds to answer (used for confidence proxy)
  - confused_services: list of service tags for confusion analysis

Run 'python3 verify_db.py' after any change to validate the pool.
"""

import sqlite3
import json
import os


DB_FILE = "ai901_simulator.db"

def init_db(force_reseed=True):
    conn = sqlite3.connect(DB_FILE)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    cursor = conn.cursor()

    # Create tables
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS questions (
        id TEXT PRIMARY KEY,
        objective TEXT,
        difficulty TEXT,
        topic TEXT,
        type TEXT,
        scenario TEXT,
        question TEXT,
        options TEXT,            -- JSON array of options
        correct_answer TEXT,     -- JSON array/string of correct answers
        explanations TEXT,       -- JSON object {correct, incorrect, concept}
        avg_time INTEGER,        -- expected seconds
        confused_services TEXT   -- JSON array of confused services for tracking
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS exam_sessions (
        session_id TEXT PRIMARY KEY,
        start_time TEXT,
        end_time TEXT,
        score INTEGER,
        status TEXT,             -- 'active', 'submitted'
        question_order TEXT      -- JSON array of question IDs
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS responses (
        session_id TEXT,
        question_id TEXT,
        selected_answer TEXT,    -- JSON of user selections
        time_spent INTEGER DEFAULT 0,
        marked_for_review INTEGER DEFAULT 0,
        is_correct INTEGER DEFAULT 0,
        PRIMARY KEY (session_id, question_id),
        FOREIGN KEY (session_id) REFERENCES exam_sessions(session_id),
        FOREIGN KEY (question_id) REFERENCES questions(id)
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        timestamp TEXT,
        score INTEGER,
        status TEXT,
        correct_count INTEGER,
        incorrect_count INTEGER,
        details TEXT             -- JSON metadata
    )
    """)

    # Migrate: Ensure is_correct column exists in responses table of existing DB
    try:
        cursor.execute("ALTER TABLE responses ADD COLUMN is_correct INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass # Column already exists

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_responses_session ON responses(session_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_history_session ON history(session_id)")

    conn.commit()

    if force_reseed:
        seed_questions(conn)
    
    conn.close()

def seed_questions(conn):
    cursor = conn.cursor()

    questions_data = []

    # Generate 152 questions to fill our pool.
    # --- OBJECTIVE 1 (Describe AI concepts and capabilities) ---
    # Weight: 40-45%. Target in pool: ~65 questions (easy, medium, hard)

    # Let's add them programmatically.
    with open("data/questions.json", "r", encoding="utf-8") as f:
        raw_questions = json.load(f)


    # Convert complex objects to JSON strings before storing in SQLite
    for q in raw_questions:
        # Resolve options dynamically depending on custom fields
        if "draggableItems" in q:
            opts = {"draggableItems": q["draggableItems"], "targets": q["targets"]}
        elif "statements" in q:
            opts = q["statements"]
        elif "parts" in q:
            opts = q["parts"]
        else:
            opts = q.get("options", [])

        # Resolve explanations with default fallback to avoid KeyError
        exps = q.get("explanations", {
            "correct": "This is correct based on Azure AI service definitions and certification curriculum guidelines.",
            "incorrect": "Review the other choices to differentiate how they differ from the correct service capability or concept.",
            "concept": q["topic"]
        })

        cursor.execute("""
        INSERT OR REPLACE INTO questions (id, objective, difficulty, topic, type, scenario, question, options, correct_answer, explanations, avg_time, confused_services)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            q["id"],
            q["objective"],
            q["difficulty"],
            q["topic"],
            q["type"],
            q["scenario"],
            q.get("question", "Select the correct option for each statement."),
            json.dumps(opts),
            json.dumps(q["correct_answer"]),
            json.dumps(exps),
            q["avg_time"],
            json.dumps(q.get("confused_services", []))
        ))

    conn.commit()
    print(f"Successfully seeded {len(raw_questions)} questions into SQLite database.")

if __name__ == "__main__":
    init_db()
