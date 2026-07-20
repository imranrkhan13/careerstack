from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.graph import NodeType
from app.models.schemas import NodeCreate, NodeOut, EdgeCreate, EdgeOut
from app.services.graph_service import GraphService
from app.routers.auth import get_current_user_id

router = APIRouter(prefix="/graph", tags=["graph"])


@router.post("/nodes", response_model=NodeOut)
def create_node(payload: NodeCreate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    node = GraphService(db).create_node(user_id, payload.type, payload.title, payload.data)
    return node


@router.get("/nodes", response_model=list[NodeOut])
def list_nodes(
    type: NodeType | None = None,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    return GraphService(db).list_nodes(user_id, type)


@router.get("/nodes/{node_id}", response_model=NodeOut)
def get_node(node_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    node = GraphService(db).get_node(user_id, node_id)
    if not node:
        raise HTTPException(404, "Node not found")
    return node


@router.post("/edges", response_model=EdgeOut)
def create_edge(payload: EdgeCreate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    try:
        return GraphService(db).create_edge(
            user_id,
            payload.source_id,
            payload.target_id,
            payload.relation,
            payload.confidence,
            payload.reasoning,
            payload.evidence,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/nodes/{node_id}/neighbors", response_model=list[NodeOut])
def get_neighbors(
    node_id: str,
    relation: str | None = None,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    return GraphService(db).neighbors(user_id, node_id, relation)
