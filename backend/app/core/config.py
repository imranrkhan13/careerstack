from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Database
    database_url: str

    # AI Providers
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    groq_api_key: str | None = None
    openrouter_api_key: str | None = None
    gemini_api_key: str | None = None
    cohere_api_key: str | None = None
    mistral_api_key: str | None = None
    scaledown_api_key: str | None = None

    # GitHub
    github_client_id: str | None = None
    github_client_secret: str |None = None

    # Google
    google_client_id: str
    google_client_secret: str
    google_redirect_uri: str

    google_auth_uri: str = "https://accounts.google.com/o/oauth2/auth"
    google_token_uri: str = "https://oauth2.googleapis.com/token"

    google_scopes: str = (
        "https://www.googleapis.com/auth/gmail.send,"
        "https://www.googleapis.com/auth/gmail.readonly"
    )

    boardy_email_address: str

    # JWT
    jwt_secret: str

    # CORS
    cors_allowed_origins: str = "http://localhost:3000"

    # Debug
    debug: bool = True


settings = Settings()