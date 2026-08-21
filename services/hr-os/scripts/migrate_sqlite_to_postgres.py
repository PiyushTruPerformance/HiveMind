"""One-off data migration: copies every row from the local SQLite database into
whatever Postgres database DATABASE_URL currently points at (e.g. Supabase).

Schema must already exist on the destination — run the backend once against the
new DATABASE_URL first (Base.metadata.create_all() in app/main.py handles that).

Safe to re-run: uses session.merge() (upsert-by-primary-key), so running this
twice just re-syncs rows rather than duplicating them.

Usage (from backend/, with .venv active and DATABASE_URL already pointing at the
Postgres destination in .env):
    python scripts/migrate_sqlite_to_postgres.py [path-to-sqlite-file]
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.db.models import Application, Candidate, Client, Job, Note

# Order matters — each model's foreign keys must already exist on the destination
# before it's copied (Job -> Client, Application -> Candidate/Job, Note -> Application).
MODELS_IN_FK_ORDER = [Client, Candidate, Job, Application, Note]


def copy_table(source_session, dest_session, model) -> int:
    rows = source_session.query(model).all()
    for row in rows:
        data = {column.name: getattr(row, column.name) for column in model.__table__.columns}
        dest_session.merge(model(**data))
    dest_session.commit()
    return len(rows)


def main() -> None:
    sqlite_path = sys.argv[1] if len(sys.argv) > 1 else "cv_analyzer.db"
    sqlite_url = f"sqlite:///{sqlite_path}"

    dest_url = get_settings().database_url
    if dest_url.startswith("sqlite"):
        print(f"DATABASE_URL is still SQLite ({dest_url}) — point it at Postgres in .env before running this.")
        sys.exit(1)

    print(f"Source (SQLite): {sqlite_url}")
    print(f"Destination (Postgres): {dest_url.split('@')[-1]}")  # omit credentials from the printed line

    source_session = sessionmaker(bind=create_engine(sqlite_url))()
    dest_session = sessionmaker(bind=create_engine(dest_url))()

    try:
        for model in MODELS_IN_FK_ORDER:
            count = copy_table(source_session, dest_session, model)
            print(f"  {model.__tablename__}: copied {count} rows")
    finally:
        source_session.close()
        dest_session.close()

    print("Done.")


if __name__ == "__main__":
    main()
