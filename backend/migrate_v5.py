"""
Paper Studio migration v5 — creates the paper_audits table for the Examine
Engine. Safe to run multiple times.

Usage:
    python migrate_v5.py
"""
import os
import sqlite3

DB_PATH = "antigravity.db"


def main() -> None:
    if not os.path.exists(DB_PATH):
        print(f"Database {DB_PATH} not found. Run the app first to create it.")
        return

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='paper_audits'
        """)
        if cur.fetchone():
            print("Table 'paper_audits' already exists.")
            return

        print("Creating paper_audits table...")
        cur.execute("""
            CREATE TABLE paper_audits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER REFERENCES paper_projects(id),
                version INTEGER DEFAULT 1,
                overall_score INTEGER DEFAULT 0,
                publication_readiness INTEGER DEFAULT 0,
                novelty_score INTEGER DEFAULT 0,
                plagiarism_risk VARCHAR DEFAULT 'low',
                ai_detection_risk VARCHAR DEFAULT 'low',
                decision VARCHAR DEFAULT 'major_revision',
                json_report TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cur.execute(
            "CREATE INDEX idx_paper_audits_project ON paper_audits(project_id)"
        )
        conn.commit()
        print("Table created.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
