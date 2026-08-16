from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    supabase_url: str
    supabase_service_role_key: str
    deepseek_api_key: str
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-v4-flash"
    llm_provider: str = "deepseek"
    gemini_api_key: Optional[str] = None
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta"
    gemini_model: str = "gemini-flash-latest"
    telegram_bot_token: str
    admin_chat_id: Optional[str] = None
    max_articles_per_topic: int = 10
    max_candidates_per_topic: int = 20
    summary_lines: int = 5
    require_all_keyword_tokens: bool = True


settings = Settings()
