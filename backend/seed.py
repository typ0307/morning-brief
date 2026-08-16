import os
import sys

from config import settings
from db.supabase import SupabaseDB


def main() -> int:
    keywords = [k.strip() for k in os.environ.get("SEED_KEYWORDS", "").split(",") if k.strip()]
    chat_id = os.environ.get("SEED_CHAT_ID", "").strip()

    if not keywords:
        print("SEED_KEYWORDS 환경변수가 필요합니다 (예: '애플,삼성전자,AI')")
        return 1

    db = SupabaseDB(settings.supabase_url, settings.supabase_service_role_key)

    user = None
    if chat_id:
        user = db.upsert_user(chat_id)
        print(f"user: {chat_id}")

    for kw in keywords:
        topic = db.upsert_topic(kw)
        if user:
            db.subscribe(user["id"], topic["id"])
        print(f"topic: {kw}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
