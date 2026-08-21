from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import get_settings

settings = get_settings()
_is_sqlite = settings.database_url.startswith("sqlite")

# NullPool: each checkout opens its own SQLite file connection rather than sharing a
# fixed-size pool. A background task holds its session open for the full pipeline
# (storage upload + slow OCR + ...), so a small QueuePool gets exhausted and starts
# raising `QueuePool limit ... connection timed out` under concurrent batch uploads.
# SQLite connections are cheap to open, unlike Postgres' real server-side connections,
# so this trades a fixed pool for one that scales with actual concurrent work.
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    poolclass=NullPool if _is_sqlite else None,
)

if _is_sqlite:
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_connection, _connection_record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def new_session() -> Session:
    """Independent session for background-task use, outside the request scope."""
    return SessionLocal()
