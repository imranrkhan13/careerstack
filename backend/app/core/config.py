from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
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
    github_client_secret: str | None = None

    # Google
    google_client_id: str
    google_client_secret: str
    google_redirect_uri: str

    # Also load these from .env instead of hardcoding
    google_auth_uri: str
    google_token_uri: str
    google_scopes: str

    # Boardy
    boardy_email_address: str

    # JWT
    jwt_secret: str

    # CORS
    cors_allowed_origins: str

    # Debug
    debug: bool = False


settings = Settings()