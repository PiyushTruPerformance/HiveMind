from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.models import Client, Job
from app.db.session import get_db
from app.schemas.client import ClientCreate, ClientOut, ClientUpdate

router = APIRouter(prefix="/clients", tags=["clients"])


@router.post("", response_model=ClientOut, status_code=201)
def create_client(payload: ClientCreate, db: Session = Depends(get_db)) -> Client:
    client = Client(name=payload.name)
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


@router.get("", response_model=list[ClientOut])
def list_clients(db: Session = Depends(get_db)) -> list[Client]:
    return db.query(Client).order_by(Client.created_at.asc()).all()


@router.patch("/{client_id}", response_model=ClientOut)
def update_client(client_id: str, payload: ClientUpdate, db: Session = Depends(get_db)) -> Client:
    client = db.query(Client).filter(Client.id == client_id).first()
    if client is None:
        raise HTTPException(status_code=404, detail="Client not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(client, field, value)

    db.commit()
    db.refresh(client)
    return client


@router.delete("/{client_id}", status_code=204)
def delete_client(client_id: str, db: Session = Depends(get_db)) -> None:
    client = db.query(Client).filter(Client.id == client_id).first()
    if client is None:
        raise HTTPException(status_code=404, detail="Client not found")

    # client_id is just a label (see TECHNICAL.md) — deleting the client un-assigns its
    # jobs rather than touching them, since the jobs themselves are still real and valid.
    db.query(Job).filter(Job.client_id == client_id).update({"client_id": None})
    db.delete(client)
    db.commit()
