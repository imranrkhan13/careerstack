"""
Real Gmail integration: OAuth with offline access, sending mail, and a polling
watcher for detecting Boardy's replies.

WHAT'S REAL vs WHAT NEEDS YOUR OWN SETUP, STATED PLAINLY:
  - The OAuth flow, token storage/refresh, sending, and polling code below all
    make genuine calls to Google's APIs and will work the moment you provide a
    real Google Cloud OAuth client (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)
    with the Gmail API enabled and your own account added as a test user (or
    the app verified, for production use).
  - True push notifications (Gmail `watch()` + Pub/Sub) additionally require a
    GCP Pub/Sub topic, granting `gmail-api-push@system.gserviceaccount.com`
    publish rights on it, and a publicly reachable HTTPS endpoint registered
    with Google (plus domain verification for that endpoint). None of that is
    something code alone can provision — it's account/infra setup only you can
    do. So the default, fully-working path here is POLLING: a background job
    periodically calls Gmail's history/messages API and checks for new mail
    from Boardy. `register_watch()` below is included and correct against
    Google's documented contract, ready to use once you've done that GCP setup,
    but polling is what actually runs by default.

Offline access = requesting a refresh_token on the initial consent screen via
`access_type=offline` + `prompt=consent`, so Boardy-reply polling can keep
working without the user re-authenticating every hour.
"""
import base64
import re
from datetime import datetime, timedelta
from email.mime.text import MIMEText

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleAuthRequest
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.graph import GoogleCredential

SCOPES = ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"]


from app.core.errors import AppError


class GmailError(AppError):
    def __init__(self, message: str, code: str = "GMAIL_ERROR", status_code: int = 502, **kwargs):
        super().__init__(code=code, message=message, status_code=status_code, **kwargs)


def _flow() -> Flow:
    if not settings.google_client_id or not settings.google_client_secret:
        raise GmailError(
            "Google OAuth isn't configured.",
            code="GMAIL_NOT_CONFIGURED",
            status_code=503,
            details="No GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET is set.",
            missing=["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
            suggestion="Create an OAuth client in Google Cloud Console with the Gmail API enabled, add the keys to backend/.env, and restart.",
        )
    client_config = {
        "web": {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [settings.google_redirect_uri],
        }
    }
    return Flow.from_client_config(client_config, scopes=SCOPES, redirect_uri=settings.google_redirect_uri)


def get_auth_url(state: str) -> str:
    flow = _flow()
    url, _ = flow.authorization_url(access_type="offline", prompt="consent", state=state)
    return url


def exchange_code(db: Session, user_id: str, code: str) -> GoogleCredential:
    flow = _flow()
    flow.fetch_token(code=code)
    creds = flow.credentials

    profile_email = None
    try:
        service = build("gmail", "v1", credentials=creds)
        profile = service.users().getProfile(userId="me").execute()
        profile_email = profile.get("emailAddress")
    except HttpError:
        pass

    record = db.query(GoogleCredential).filter(GoogleCredential.user_id == user_id).first()
    if not record:
        record = GoogleCredential(user_id=user_id)
    record.access_token = creds.token
    record.refresh_token = creds.refresh_token or record.refresh_token
    record.token_expiry = creds.expiry
    record.scopes = " ".join(creds.scopes or SCOPES)
    record.email_address = profile_email
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def _get_credentials(db: Session, user_id: str) -> Credentials:
    record = db.query(GoogleCredential).filter(GoogleCredential.user_id == user_id).first()
    if not record:
        raise GmailError(
            "Gmail isn't connected yet.",
            code="GMAIL_NOT_CONNECTED",
            status_code=401,
            suggestion="Go to Settings and click Connect Gmail.",
        )

    if not record.refresh_token:
        raise GmailError(
            "Your Google connection doesn't have offline access, so it can't refresh its token.",
            code="GMAIL_MISSING_REFRESH_TOKEN",
            status_code=401,
            details="This usually happens when Google skips issuing a refresh_token because it thinks you already granted access before.",
            suggestion="Go to Settings, disconnect Gmail, then go to https://myaccount.google.com/permissions and remove CareerOS's access there too — then reconnect. That forces Google to issue a fresh refresh_token.",
        )

    creds = Credentials(
        token=record.access_token,
        refresh_token=record.refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        scopes=(record.scopes or "").split(),
    )
    if creds.expired and creds.refresh_token:
        creds.refresh(GoogleAuthRequest())
        record.access_token = creds.token
        record.token_expiry = creds.expiry
        db.add(record)
        db.commit()
    return creds


def is_connected(db: Session, user_id: str) -> dict:
    record = db.query(GoogleCredential).filter(GoogleCredential.user_id == user_id).first()
    if not record:
        return {"connected": False}
    return {"connected": True, "email": record.email_address, "connected_at": record.connected_at.isoformat()}


def send_email(db: Session, user_id: str, to: str, subject: str, body: str, thread_id: str | None = None) -> dict:
    creds = _get_credentials(db, user_id)
    service = build("gmail", "v1", credentials=creds)

    message = MIMEText(body)
    message["to"] = to
    message["subject"] = subject
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()

    body_payload = {"raw": raw}
    if thread_id:
        body_payload["threadId"] = thread_id

    try:
        sent = service.users().messages().send(userId="me", body=body_payload).execute()
    except HttpError as e:
        raise GmailError("Gmail rejected the send request.", code="GMAIL_SEND_FAILED", details=str(e), suggestion="Check the recipient address and that your Gmail token hasn't expired.")
    return {"message_id": sent["id"], "thread_id": sent.get("threadId")}


def poll_for_replies(db: Session, user_id: str, from_address_contains: str, since_hours: int = 168) -> list[dict]:
    """
    Polling fallback (the default, working path — see module docstring). Lists
    recent messages and returns ones that look like a Boardy reply — a real
    Gmail query, not a simulated inbox.
    """
    creds = _get_credentials(db, user_id)
    service = build("gmail", "v1", credentials=creds)

    query = f"from:{from_address_contains} newer_than:{since_hours}h"
    try:
        results = service.users().messages().list(userId="me", q=query, maxResults=20).execute()
    except HttpError as e:
        raise GmailError("Gmail rejected the poll request.", code="GMAIL_POLL_FAILED", details=str(e), suggestion="Check your Gmail connection in Settings hasn't expired.")

    messages = []
    for m in results.get("messages", []):
        full = service.users().messages().get(userId="me", id=m["id"], format="full").execute()
        headers = {h["name"].lower(): h["value"] for h in full["payload"].get("headers", [])}
        body = _extract_body(full["payload"])
        messages.append(
            {
                "gmail_message_id": full["id"],
                "thread_id": full["threadId"],
                "subject": headers.get("subject", ""),
                "from": headers.get("from", ""),
                "date": headers.get("date", ""),
                "body": body,
            }
        )
    return messages


def _extract_body(payload: dict) -> str:
    if payload.get("mimeType") == "text/plain" and "data" in payload.get("body", {}):
        return base64.urlsafe_b64decode(payload["body"]["data"]).decode("utf-8", errors="replace")
    for part in payload.get("parts", []) or []:
        text = _extract_body(part)
        if text:
            return text
    return ""


def register_watch(db: Session, user_id: str, topic_name: str) -> dict:
    """
    Registers a real Gmail push watch against the given Pub/Sub topic
    (projects/{project}/topics/{topic}). Only usable once you've created that
    topic and granted gmail-api-push@system.gserviceaccount.com publish rights
    on it — see the module docstring. Not called anywhere by default; polling
    is what actually runs.
    """
    creds = _get_credentials(db, user_id)
    service = build("gmail", "v1", credentials=creds)
    try:
        return service.users().watch(userId="me", body={"topicName": topic_name, "labelIds": ["INBOX"]}).execute()
    except HttpError as e:
        raise GmailError("Gmail watch registration failed.", code="GMAIL_WATCH_FAILED", details=str(e), suggestion="Confirm the Pub/Sub topic exists and gmail-api-push@system.gserviceaccount.com has publish rights on it.")
