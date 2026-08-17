# 모닝브리프 프론트엔드

Next.js 16.3.1 (App Router, TypeScript, Tailwind) 웹 프론트엔드.
별도 API 서버 없이 **Supabase에 직접 접근**(RLS)합니다.

프로젝트 전체 개요는 [루트 README](../README.md)를 참고하세요.

## 요구 사항

- Node.js 20+
- Supabase 프로젝트 (Auth: Google/Kakao)

## 디렉터리 구조

```
src/app/              페이지 (/, /login, /keywords, /settings, /auth/callback)
  (app)/              인증 사용자 전용 레이아웃(네비게이션 포함)
  auth/callback/      OAuth code exchange
src/components/       UI 컴포넌트
src/lib/              Supabase 클라이언트, 타입, 인증 헬퍼
src/proxy.ts          세션 갱신 + 비로그인 리다이렉트 (Next 16의 middleware)
```

## 설정

```bash
cd frontend
npm install
cp .env.example .env.local   # 아래 환경변수 값 채우기
npm run dev                  # http://localhost:3000
```

### 환경변수 (`frontend/.env.local`)

| 변수 | 설명 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL (backend의 `SUPABASE_URL`과 동일) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key (브라우저 노출 가능, **service_role 키 금지**) |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | 텔레그램 봇 username (`@` 없이) |
| `NEXT_PUBLIC_DISCORD_BOT_INVITE_URL` | (선택) 디스코드 봇 OAuth2 초대 링크 (`https://discord.com/api/oauth2/authorize?client_id=<BOT_CLIENT_ID>&scope=bot&permissions=0`) |

### Supabase Auth 설정

1. **Authentication > Providers**에서 Google, Kakao 활성화
   (각각 개발자 콘솔에서 클라이언트 ID/시크릿 발급)
2. **Authentication > URL Configuration**에 등록
   - Site URL: `http://localhost:3000` (운영: Vercel 도메인)
   - Redirect URL: `http://localhost:3000/auth/callback` (운영: `https://<domain>/auth/callback`)

## 페이지

| 경로 | 설명 |
| --- | --- |
| `/` | 내 구독 키워드의 브리핑 목록 (날짜 desc, 토픽 필터 칩, 제목·요약·sentiment·출처 링크) |
| `/keywords` | 내 구독 목록, 키워드 추가(topics upsert + subscribe), 구독 해지 |
| `/settings` | 텔레그램/디스코드 계정 연결·해제 (8자리 코드 발급 → 완료 감지) |
| `/login` | Google/Kakao OAuth 로그인 |

## 빌드/배포

```bash
npm run build   # 프로덕션 빌드
npm run lint    # ESLint
```

Vercel 배포 시 `NEXT_PUBLIC_*` 환경변수를 프로젝트 설정에 동일하게 등록합니다.

## 인증 흐름

- 비로그인 사용자는 `src/proxy.ts`가 `/login`으로 리다이렉트
- `/login`에서 `signInWithOAuth` → Supabase OAuth → `/auth/callback`에서 `exchangeCodeForSession`
- 최초 로그인 시 Supabase 트리거가 `public.users` 행을 자동 생성(`auth_user_id`)
