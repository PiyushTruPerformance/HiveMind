from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CandidateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str | None
    email: str | None
    phone: str | None
    blob_url: str | None
    created_at: datetime
