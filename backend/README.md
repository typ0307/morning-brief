# 모닝브리프 백엔드

기사 수집 → 선별 → 본문 추출 → 요약 → 텔레그램 발송 파이프라인과 텔레그램 봇.

프로젝트 전체 개요는 [루트 README](../README.md)를 참고하세요.

## 요구 사항

- Python 3.14 (`.python-version`에 명시)
- [uv](https://docs.astral.sh/uv/) (의존성·가상환경 관리)
- Supabase 프로젝트
- 외부 API: 네이버 뉴스 검색, 텔레그램 봇, LLM(DeepSeek 또는 OpenRouter)

## 디렉터리 구조

```
ai/            LLM 어댑터(OpenAI 호환), 프롬프트, JSON 파싱
collectors/    네이버 뉴스 수집기
db/            Supabase DB 레이어
notifier/      텔레그램 발송
main.py        배치 파이프라인 (--dry-run 지원)
bot.py         텔레그램 봇
seed.py        키워드/구독 시드
```

## 설정

```bash
cd backend
uv sync                            # pyproject.toml 기반으로 .venv 생성 + 의존성 설치
cp .env.example .env               # 아래 환경변수 값 채우기
```

### 환경변수 (`backend/.env`)

| 변수 | 설명 |
| --- | --- |
| `SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role 키 (서버 전용, RLS 우회) |
| `LLM_PROVIDER` | `deepseek` 또는 `openrouter` |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL` | DeepSeek 설정 |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | OpenRouter 설정 |
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | 네이버 뉴스 검색 API 키 |
| `TELEGRAM_BOT_TOKEN` | BotFather에서 발급한 봇 토큰 |
| `ADMIN_CHAT_ID` | (선택) 파이프라인 실패 알림 수신 chat_id |
| `MAX_ARTICLES_PER_TOPIC` | 키워드별 요약에 사용할 기사 수 |
| `MAX_CANDIDATES_PER_TOPIC` | LLM 선별 대상 후보 기사 수 |
| `MAX_ARTICLE_AGE_HOURS` | 이 시간보다 오래된 기사 제외 (0이면 비활성화) |
| `SUMMARY_LINES` | 요약 줄 수 |
| `REQUIRE_ALL_KEYWORD_TOKENS` | 키워드의 모든 단어가 포함된 기사만 통과 |

## 실행

```bash
uv run python main.py --dry-run   # 수집~요약까지 실행, 텔레그램 미발송(콘솔 출력)
uv run python main.py             # 실제 발송
uv run python bot.py              # 텔레그램 봇 실행

# 시드 (기존 chat_id 구독자에게 키워드 구독 생성)
SEED_KEYWORDS=애플,삼성전자 SEED_CHAT_ID=<chat_id> uv run python seed.py
```

## 텔레그램 봇 명령어

| 명령어 | 설명 |
| --- | --- |
| `/start <code>` | 웹에서 발급한 코드로 계정 연결 (코드 없으면 도움말) |
| `/subscribe <키워드>` | 토픽 구독 |
| `/unsubscribe <키워드>` | 토픽 구독 취소 |
| `/list` | 내 구독 목록 |
| `/brief <키워드>` | 해당 키워드 바로 요약 |
| `/help` | 도움말 |
