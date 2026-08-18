# 이메일 가입 시 중복 이메일 차단 + 안내 개선

## 배경

소셜(구글/네이버)로 이미 가입된 이메일(예: `typ0307@gmail.com`)로 이메일 가입을 시도하면
**중복 계정이 생성되는 일 자체는 이미 차단**되어 있다 (Supabase `auth.users` 이메일 유니크).

문제는 사용자 경험에만 있다:
- Supabase `signUp`은 이메일 확인 설정이 켜져 있으면 **반-열거형(signup anti-enumeration)**
  때문에 기존 이메일에도 "확인 이메일을 보냈습니다"처럼 성공 응답을 주고,
  꺼져 있으면 영문 에러 `User already registered`를 그대로 표시한다.
  → 현재 `login-form.tsx:84`는 어느 쪽이든 정확한 안내를 못 준다.
- 이메일 **로그인**도 소셜 계정(비밀번호 없음)은 영문 "Invalid login credentials"로 실패한다.

## 결정 사항

- **정책 유지**: 같은 이메일의 다른 제공자 계정은 별개 계정으로 둔다 (가입 시 중복만 차단, 통합/링킹 안 함).
- **가입 차단 방식**: `signUp` 응답에 의존하지 않고, **서버 액션에서 admin 클라이언트로 이메일 존재를 사전 확인**한다.
  - 대시보드 설정(이메일 확인 ON/OFF)과 무관하게 결정적.
  - 이메일 열거(enumeration) 노출을 수반하지만, 이메일이 곧 식별자인 서비스 특성상 수용.
- **UX**: 등록된 이메일이면 인라인 에러 `"이미 가입된 이메일입니다. 로그인해 주세요."` 표시 +
  **로그인 모드로 자동 전환**(입력한 이메일 유지)해 바로 로그인할 수 있게 한다.
- **로그인/가입 에러 한글화**: 영문 Supabase 에러 메시지를 한국어로 매핑.

## 구현 태스크 (순서대로)

### 1. 서버 액션 — `frontend/src/lib/auth-actions.ts` (신규)

- `"use server"` 파일, async 함수만 export.
- `checkEmailRegistered(email: string): Promise<{ registered: boolean }>`
  - `createAdminClient()` (`@/lib/supabase/admin`) 사용.
  - `admin.auth.admin.listUsers({ perPage: 1000 })` → `users.find(u => u.email?.toLowerCase() === email.toLowerCase())`.
  - admin 키 부재/API 오류 시 `try/catch`로 **`{ registered: false }` 반환** (기존 동작으로 폴백).
  - 기존 `auth/callback/naver/route.ts:30`의 listUsers 패턴과 동일, 페이징은 `perPage: 1000` 지정.

### 2. 가입 차단 — `frontend/src/components/login-form.tsx` 수정

- `checkEmailRegistered` import.
- `onSubmit` signup 분기 (현재 69~87행)에서 순서:
  1. 필드 검증 (현행)
  2. 캡차 검증 (현행)
  3. **`checkEmailRegistered(email)` 호출** → `registered`면:
     - `setError("이미 가입된 이메일입니다. 로그인해 주세요.")`
     - `setMode("login")`, `setPassword("")`, 캡차 리셋 (기존 `switchMode` 재사용 — 단, 이메일은 유지되어야 하므로 switchMode는 email을 건드리지 않음, 현재 코드 확인 결과 유지됨)
     - `return` (signUp 미호출)
  4. 기존 signUp 진행.
- `loading` 상태는 체크 중에도 표시되도록 `setLoading(true)`를 체크 전에 이동.

### 3. 에러 한글화 — 같은 파일에 헬퍼 추가

- `friendlyAuthError(message: string): string` 로컬 헬퍼, 주요 매핑:
  - `Invalid login credentials` → `이메일 또는 비밀번호가 올바르지 않습니다.`
  - `User already registered` → `이미 가입된 이메일입니다.`
  - `Email not confirmed` → `이메일 인증이 완료되지 않았습니다.`
  - `Password should be at least 8 characters` → `비밀번호는 8자 이상이어야 합니다.`
  - 나머지는 원문 그대로.
- login/signup/forgot 세 분기의 `setError(error.message)`를 `friendlyAuthError(error.message)`로 교체.
- (에러 한글화는 이 계획의 부수 개선. 별도 원하면 분리 가능)

### 4. 환경 변수 — `frontend/.env.example` / 로컬 `.env.local`

- `SUPABASE_SERVICE_ROLE_KEY`가 `.env.example`에 있는지 확인, 없으면 추가(주석: 서버 전용, 프론트에 노출 금지).
- 로컬 `.env.local`에 해당 키 없으면 이 기능만 폴백(기존 동작)하므로 동작은 유지.

## 검증

- `cd frontend && npm run lint && npm run build`.
- 수동 시나리오:
  1. 소셜로 가입된 이메일로 이메일 **가입** 시도 → "이미 가입된 이메일입니다. 로그인해 주세요." 표시 + 로그인 모드로 전환 (이메일 유지). "확인 이메일을 보냈습니다" 미표시.
  2. 이메일로 가입된 이메일로 재가입 시도 → 위와 동일.
  3. 새 이메일 가입 → 기존 확인 메일 흐름 그대로.
  4. 로그인 잘못된 비밀번호 → 한국어 에러.
  5. 소셜 전용 계정으로 이메일 로그인 → 한국어 에러.
  6. admin 키 없는 환경 → 기존 동작(영문 에러)으로 폴백 확인.

## 리스크

- **이메일 열거 노출**: 미인증 요청으로 이메일 존재 여부가 드러남. 이 서비스에서 이메일은 식별자이므로 수용 (범위 제외로 명시).
- **listUsers 페이징**: `perPage: 1000`까지 커버, 그 이상 유저 수면 누락 가능. 현재 규모에서는 문제없음.
- **admin 키 누락 시**: 체크가 폴백되어 안내가 뜨지 않음 — 기능이 조용히 비활성화됨.

## 범위 제외

- 네이버/구글/이메일 계정 간 통합·링킹 (정책상 별개 계정 유지).
- 가입 화면 UI 재설계, 캡차 정책 변경, rate limiting.
