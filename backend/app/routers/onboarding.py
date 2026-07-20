from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.graph import NodeType
from app.services.extraction_service import extract_career_entities
from app.services.github_import import import_repos
from app.services.graph_service import GraphService
from app.services.gap_detection import detect_gaps
from app.routers.auth import get_current_user_id

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


class TextPayload(BaseModel):
    text: str


class GitHubPayload(BaseModel):
    username: str


@router.post("/parse-resume")
async def parse_resume(payload: TextPayload, user_id: str = Depends(get_current_user_id)):
    return await extract_career_entities(payload.text)


@router.post("/parse-linkedin")
async def parse_linkedin(payload: TextPayload, user_id: str = Depends(get_current_user_id)):
    return await extract_career_entities(payload.text)


@router.post("/import-github")
async def import_github(payload: GitHubPayload, user_id: str = Depends(get_current_user_id)):
    return await import_repos(payload.username)


class BuildGraphPayload(BaseModel):
    resume: dict | None = None
    linkedin: dict | None = None
    github_repos: list[dict] = []


@router.post("/build-graph")
def build_graph(
    payload: BuildGraphPayload,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    graph = GraphService(db)
    skill_nodes: dict[str, str] = {}

    def ensure_skill(name: str) -> str:
        if name not in skill_nodes:
            node = graph.create_node(user_id, NodeType.skill, name, {})
            skill_nodes[name] = node.id
        return skill_nodes[name]

    created = {"skills": 0, "roles": 0, "projects": 0, "repositories": 0, "gaps": []}

    for source in (payload.resume, payload.linkedin):
        if not source:
            continue
        for skill in source.get("skills", []):
            if skill not in skill_nodes:
                ensure_skill(skill)
                created["skills"] += 1
        for role in source.get("roles", []):
            graph.create_node(user_id, NodeType.company, role.get("company", "Unknown"), role)
            created["roles"] += 1
        for project in source.get("projects", []):
            graph.create_node(user_id, NodeType.project, project.get("name", "Untitled project"), project)
            created["projects"] += 1

    for repo in payload.github_repos:
        node = graph.create_node(
            user_id,
            NodeType.repository,
            repo["name"],
            {
                "description": repo.get("description"),
                "language": repo.get("language"),
                "stars": repo.get("stars"),
                "url": repo.get("url"),
            },
        )
        if repo.get("language") and repo["language"] not in skill_nodes:
            skill_id = ensure_skill(repo["language"])
            created["skills"] += 1
            graph.create_edge(
                user_id,
                node.id,
                skill_id,
                "demonstrates_skill",
                confidence=0.8,
                reasoning=f"GitHub reports {repo['language']} as the repository's primary language.",
                evidence=[{"source": "github_api", "detail": repo["url"]}],
            )
        created["repositories"] += 1

    created["gaps"] = detect_gaps(list(skill_nodes.keys()))
    return created
