# 모닝브리프 백엔드

기사 수집 → 선별 → 본문 추출 → 요약 → 텔레그램/디스코드 발송 파이프라인과 봇들.

프로젝트 전체 개요는 [루트 README](../README.md)를 참고하세요.

## 요구 사항

- Python 3.14 (`.python-version`에 명시)
- [uv](https://docs.astral.sh/uv/) (의존성·가상환경 관리)
- Supabase 프로젝트
- 외부 API: 네이버 뉴스 검색, 텔레그램 봇, 디스코드 봇, LLM(DeepSeek 또는 OpenRouter)

## 디렉터리 구조

```
ai/            LLM 어댑터(OpenAI 호환), 프롬프트, JSON 파싱
collectors/    네이버 뉴스 수집기
db/            Supabase DB 레이어
notifier/      텔레그램/디스코드 발송
main.py          배치 파이프라인 (--dry-run 지원)
scheduler.py     사용자별 발송 일정 스케줄러 (--once/--dry-run 지원)
telegram_bot.py  텔레그램 봇
discord_bot.py   디스코드 봇
seed.py          키워드/구독 시드
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
| `DISCORD_BOT_TOKEN` | (선택) Discord Developer Portal에서 발급한 봇 토큰 (미설정 시 Discord 발송/봇 비활성화) |
| `ADMIN_DISCORD_USER_ID` | (선택) 디스코드 봇 `!refresh` 관리자 판정에 사용하는 discord user id |
| `MAX_ARTICLES_PER_TOPIC` | 키워드별 요약에 사용할 기사 수 |
| `MAX_CANDIDATES_PER_TOPIC` | LLM 선별 대상 후보 기사 수 |
| `MAX_ARTICLE_AGE_HOURS` | 이 시간보다 오래된 기사 제외 (0이면 비활성화) |
| `SUMMARY_LINES` | 요약 줄 수 |
| `REQUIRE_ALL_KEYWORD_TOKENS` | 키워드의 모든 단어가 포함된 기사만 통과 |
| `SCHEDULE_GRACE_MINUTES` | 일정 시각 경과 후 발송 재시도 유예 시간(분) |

## 실행

```bash
uv run python main.py --dry-run   # 수집~요약까지 실행, 발송 미수행(콘솔 출력)
uv run python main.py             # 실제 발송
uv run python scheduler.py        # 발송 일정 스케줄러 (상시 실행, 매분 체크)
uv run python scheduler.py --once          # 1회만 체크 후 종료
uv run python scheduler.py --once --dry-run  # 발송 없이 due 판정 로그만 확인
uv run python telegram_bot.py       # 텔레그램 봇 실행
uv run python discord_bot.py      # 디스코드 봇 실행

# 시드 (기존 chat_id 구독자에게 키워드 구독 생성)
SEED_KEYWORDS=애플,삼성전자 SEED_CHAT_ID=<chat_id> uv run python seed.py
```

## DB 마이그레이션

`scheduler.py`/발송 일정을 사용하려면 먼저 Supabase **SQL Editor**에서 아래 DDL을 실행하세요.

1. `briefings`에 `time_slot text NOT NULL DEFAULT ''` 컬럼 추가
2. 기존 `(topic_id, brief_date)` unique 제약 제거 후 `UNIQUE (topic_id, brief_date, time_slot)` 추가
3. `send_schedules` 테이블 생성 (+ `day_times jsonb`, RLS 본인 행만 정책 4종)

SQL 파일은 저장소에 커밋하지 않고(유지 관리 방식에 따라) Supabase SQL Editor에서 직접 실행합니다.

## 발송 일정 동작

- 웹 `/settings`의 "발송 일정" 카드에서 **요일별 발송 시각**과 활성화를 설정합니다
  (`send_schedules.day_times`: 요일(0=월~6=일) → `"HH:MM"` 시각 목록).
  예: 평일 08:00, 월·금 17:00, 화·수·목 18:00, 주말 12:00.
- 시각이 없는 요일은 발송하지 않으며, **일정이 없는 사용자에게는 스케줄러가 발송하지 않습니다.**
- `scheduler.py`는 매분 정각에 일정을 확인해, 오늘이 시각이 지정된 요일이고 현재 시각이
  지정 시각부터 **30분 유예창(`SCHEDULE_GRACE_MINUTES`) 안**인 사용자에게만 발송합니다.
- 시각마다 그 시점의 최신 기사로 **새 브리핑**을 생성합니다
  (슬롯 브리핑은 `briefings.time_slot`으로 구분).
- 발송 dedup은 `deliveries`가 담당하므로 유예창 내 재실행 시 성공한 채널은 재발송되지 않고,
  실패한 채널만 재시도됩니다. 유예창(30분)이 지나면 해당 발송은 다음 주기로 넘어갑니다.
- 슬롯 사이 신규 기사가 없으면 그 발송은 스킵됩니다 (정상 동작, 로그에 "신규 기사 없음(중복)" 기록).
- 시간대는 KST(Asia/Seoul) 고정입니다. 일정은 사용자당 1개로 구독 중인 **모든 토픽에 공통** 적용됩니다.

## 텔레그램 봇 명령어

| 명령어 | 설명 |
| --- | --- |
| `/start <code>` | 웹에서 발급한 코드로 계정 연결 (코드 없으면 도움말) |
| `/subscribe <키워드>` | 토픽 구독 |
| `/unsubscribe <키워드>` | 토픽 구독 취소 |
| `/list` | 내 구독 목록 |
| `/brief <키워드>` | 해당 키워드 바로 요약 |
| `/help` | 도움말 |

## 디스코드 봇 명령어

디스코드 봇은 슬래시 커맨드(`/`)와 접두사 명령어(`!`)를 함께 지원하며,
봇과 같은 서버가 있어야 DM을 주고받을 수 있습니다. 슬래시 커맨드를 사용하려면
초대 링크에 `applications.commands` 스코프가 필요합니다.

| 슬래시 커맨드 | 접두사 | 설명 |
| --- | --- | --- |
| `/start <코드>` | `!start <코드>` | 웹에서 발급한 코드로 계정 연결 (DM에 코드만 보내도 연결) |
| `/subscribe <키워드>` | `!subscribe <키워드>` | 토픽 구독 |
| `/unsubscribe <키워드>` | `!unsubscribe <키워드>` | 토픽 구독 취소 |
| `/list` | `!list` | 내 구독 목록 |
| `/brief <키워드>` | `!brief <키워드>` | 해당 키워드 바로 요약 |
| `/help` | `!help` | 도움말 |
| `/refresh` | `!refresh` | (관리자) 파이프라인 즉시 실행 |

디스코드 봇 설정 시 Discord Developer Portal에서 **Message Content Intent**를 켜야
`!` 명령어와 코드 DM을 수신할 수 있습니다. 봇 초대 링크는 프론트엔드의
`NEXT_PUBLIC_DISCORD_BOT_INVITE_URL`에 등록합니다.
