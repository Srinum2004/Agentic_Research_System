"""
Paper Studio migration v4 — adds paper_format column to paper_projects.

Safe to run multiple times. Existing rows keep paper_format = "" so they
remain backward compatible (intake flow can still fill it in).

Usage:
    python migrate_v4.py
"""
import os
import sqlite3

DB_PATH = "antigravity.db"


def main() -> None:
    if not os.path.exists(DB_PATH):
        print(f"Database {DB_PATH} not found. Run the app first or migrate_v3.py to create tables.")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute("PRAGMA table_info(paper_projects)")
        columns = [c[1] for c in cursor.fetchall()]
        if "paper_format" in columns:
            print("Column 'paper_format' already exists on paper_projects.")
            return
        print("Adding paper_format column to paper_projects...")
        cursor.execute(
            "ALTER TABLE paper_projects ADD COLUMN paper_format VARCHAR DEFAULT ''"
        )
        conn.commit()
        print("Column added.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
