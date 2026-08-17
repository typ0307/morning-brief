from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    supabase_url: str
    supabase_service_role_key: str
    llm_provider: str = "deepseek"
    deepseek_api_key: str | None = None
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"
    openrouter_api_key: str | None = None
    openrouter_model: str = "inclusionai/ling-3.0-flash"
    naver_client_id: str | None = None
    naver_client_secret: str | None = None
    telegram_bot_token: str
    admin_chat_id: str | None = None
    max_articles_per_topic: int = 5
    max_candidates_per_topic: int = 20
    max_article_age_hours: int = 48
    summary_lines: int = 5
    require_all_keyword_tokens: bool = True


settings = Settings()
