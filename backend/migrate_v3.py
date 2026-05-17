"""
Paper Studio migration — creates only the new tables.

Safe to run multiple times. Does not touch existing tables (users,
agent_logs, limit_requests, notifications, verification_codes).

Usage:
    python migrate_v3.py
"""
from db import engine, Base, PaperProject, PaperMessage, PaperSection, PaperAsset

NEW_TABLES = [
    PaperProject.__table__,
    PaperMessage.__table__,
    PaperSection.__table__,
    PaperAsset.__table__,
]


def main():
    Base.metadata.create_all(bind=engine, tables=NEW_TABLES)
    print("Paper Studio tables created/verified:")
    for t in NEW_TABLES:
        print(f"  - {t.name}")


if __name__ == "__main__":
    main()
