# 모닝브리프 (Morning Brief)

출근길에 읽는 **팩트 중심 뉴스 요약 브리핑** 서비스.

네이버 뉴스 API로 기사를 수집하고, LLM이 키워드별로 중복을 제거·선별·요약한 뒤
텔레그램으로 발송합니다. 웹에서는 소셜 로그인(Google/Kakao)으로 가입해
브리핑을 열람하고 키워드를 구독·관리하며 텔레그램 계정을 연결할 수 있습니다.

## 구성

| 디렉터리 | 설명 | 상세 |
| --- | --- | --- |
| `backend/` | 기사 수집·요약·텔레그램 발송 파이프라인 + 봇 (Python) | [`backend/README.md`](backend/README.md) |
| `frontend/` | 웹 프론트엔드 (Next.js 16.3.1, Supabase 직접 접근) | [`frontend/README.md`](frontend/README.md) |

## 아키텍처

```
[Next.js 프론트] ──(anon key + RLS)──┐
                                      ├──> Supabase (Postgres + Auth)
[Python 백엔드/봇] ──(service_role)───┘

백엔드 (배치/봇)
  ├─ main.py   : 수집 → 선별 → 본문 → 요약 → 텔레그램 발송 파이프라인
  └─ bot.py    : 텔레그램 봇 (/subscribe, /unsubscribe, /list, /brief, /start <code>)
```

- **프론트엔드**는 별도 API 서버 없이 **Supabase에 직접 접근**(RLS)합니다.
- **백엔드**는 사용자 요청을 받는 API 서버가 아니라 스케줄러/봇으로 동작하며 `service_role` 키로 DB에 접근합니다.
- 둘은 같은 Supabase DB를 공유하지만 서로 직접 호출하지 않습니다.

## RLS 정책 요약

- `topics` / `briefings` / `articles`: 인증 사용자 모두 열람(카탈로그 모델)
- `users`: 본인 행만 SELECT/UPDATE
- `subscriptions`: 본인 행만 SELECT/INSERT/DELETE
- `link_codes`: 본인 것만 SELECT/INSERT (UPDATE/DELETE는 service_role 전용)
- `deliveries`: 정책 없음(service_role 전용)

## 텔레그램 계정 연결 흐름

1. 웹 `/settings`에서 "텔레그램 연결" 클릭 → `link_codes`에 10분 만료 코드 생성
2. `https://t.me/<bot>?start=<code>` 새 탭 오픈
3. 봇이 `/start <code>` 수신 → 코드 검증 후 `users.telegram_chat_id` 설정
4. 웹은 5초 간격 폴링 + 포커스 시 재조회로 연결 완료 감지

## 범위 제외

- 디스코드 봇 실구현 (웹 연결/해제 UI와 `link_codes.channel='discord'` 패턴은 준비, 봇 연동은 추후)
- 웹에서 파이프라인 수동 실행
- 가입 제한 (필요 시 Supabase 대시보드에서 signup 비활성화로 대응)
