from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.clerk_auth import require_auth
from app.core.config import get_settings
from app.db.base import Base
from app.db.session import engine
from app.routers import applications, clients, dashboard, jobs

settings = get_settings()

Base.metadata.create_all(bind=engine)

app = FastAPI(title="CV Analyzer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(jobs.router, dependencies=[Depends(require_auth)])
app.include_router(applications.router, dependencies=[Depends(require_auth)])
app.include_router(dashboard.router, dependencies=[Depends(require_auth)])
app.include_router(clients.router, dependencies=[Depends(require_auth)])


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
