# 로그인 페이지 마무리 (비밀번호 8자 · 이메일 인증 리다이렉트 · 배너)

## 목표

적용된 로그인 페이지(소셜 버튼 + 이메일 폼)를 마무리한다. 남은 3가지를 구현한다.
1. 비밀번호 최소 길이 6 → 8 (클라이언트 검증)
2. 이메일 가입(`signUp`)에 `emailRedirectTo`를 추가해 확인 메일 링크를 `/login?confirmed=1`로 안내
3. `/login?confirmed=1`(인증 완료) 및 `/login?error=auth`(OAuth 실패, `/auth/callback`이 생성) 배너를 **login 페이지에서 렌더**해 사용자에게 피드백 제공

범위: 프론트 코드 2파일 + Supabase 대시보드 수동 설정 문서화. DB/백엔드 변경 없음.

## 현재 상태 (확인 완료)

- `frontend/src/components/login-buttons.tsx` — 구글/네이버/카카오/애플 "~로 시작하기" + 로고 ✅ (수정 불필요)
- `frontend/src/components/login-form.tsx` — 로그인/가입/비밀번호 찾기 폼. 비밀번호 길이 6, `signUp`에 `emailRedirectTo` 없음.
- `frontend/src/app/login/page.tsx` — `LoginButtons` + "또는" 구분선 + `LoginForm`. 파라미터 미처리.
- Next.js 16.3.1 → 서버 페이지의 `searchParams`는 **Promise**(`await` 필수).

## 작업 목록

### 1. `frontend/src/components/login-form.tsx`

**(a) 비밀번호 최소 길이 8** — 3곳 수정
- 가드: `if (password.length < 6)` → `if (password.length < 8)`
- 메시지: `"비밀번호는 8자 이상이어야 합니다."`
- 플레이스홀더: `placeholder="8자 이상"`

**(b) `signUp`에 `emailRedirectTo` 추가** (현재 `signUp({ email, password })` 호출)
```tsx
const { error } = await supabase.auth.signUp({
  email,
  password,
  options: { emailRedirectTo: `${window.location.origin}/login?confirmed=1` },
});
```

**(c) 초기 배너 prop 추가**
- `LoginForm`은 현재 무인자이므로 Props에 추가:
  ```tsx
  type Props = { initialNotice?: string | null; initialError?: string | null };
  ```
- `info`/`error` state 초기값을 prop으로 설정:
  - `const [info, setInfo] = useState<string | null>(initialNotice ?? null);`
  - `const [error, setError] = useState<string | null>(initialError ?? null);`
- 기존 렌더(`info`→emerald, `error`→rose)를 그대로 사용 → 배너가 상단에 표시됨.

### 2. `frontend/src/app/login/page.tsx`

- `searchParams`를 읽도록 수정 (async, Promise await):
  ```tsx
  export default async function LoginPage({
    searchParams,
  }: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
  }) {
    const params = await searchParams;
    const notice = params.confirmed === "1"
      ? "이메일 인증이 완료되었습니다. 로그인해 주세요."
      : null;
    const error = params.error === "auth"
      ? "로그인에 실패했습니다. 다시 시도해 주세요."
      : null;
    ...
  ```
- `<LoginForm initialNotice={notice} initialError={error} />` 전달.

### 3. Supabase 대시보드 (수동 설정 — 코드 아님)

- **Authentication > Providers > Email**: 활성화, **Confirm email ON**.
- **Authentication > URL Configuration > Redirect URLs**:
  - `http://localhost:3000/login` 및 운영 도메인 `https://<도메인>/login` 추가
  - (Site URL은 항상 허용. `emailRedirectTo`로 사용하는 `/login`은 여기 등록 필요, 미등록 시 Supabase가 리다이렉트 거부)
- **Naver/Apple** 제공자 키 입력: Naver Developers 앱, Apple Sign-in 설정 → Supabase 콜백 `https://<ref>.supabase.co/auth/v1/callback`.

## 참고 / 리스크

- Supabase 서버 기본 최소 길이는 6자. 클라이언트에서 8자 미만을 먼저 차단하므로 신규 가입 시 실질적으로 8자 강제됨. (대시보드에 별도 최소 길이 항목이 없으면 서버 설정 불필요)
- 이메일 인증(Confirm email ON)일 때만 `emailRedirectTo` 흐름이 의미 있음. OFF면 `signUp`이 즉시 세션을 만들어 `/`로 이동함.
- `error=auth` 배너: `/auth/callback/route.ts`의 실패 리다이렉트(`/login?error=auth`)에 대응. 파라미터 키 `error`는 `confirmed`와 충돌하지 않음.

## 검증

1. `cd frontend && npm run lint`
2. `npm run build` (임포/타입 통과 확인)
3. 수동 E2E:
   - `/settings`·`/keywords` 접근 시 비로그인 → `/login` 리다이렉트 정상
   - `회원가입` → 8자 미만 입력 시 오류 문구 확인
   - 가입 성공 → "확인 이메일을 보냈습니다" 안내 → 메일 링크 클릭 → `/login?confirmed=1` 배너 확인 → 로그인 성공 → `/` 이동
   - 소셜(구글/네이버/카카오/애플) 버튼 → callback → 성공 시 `/` / 실패 시 `?error=auth` 배너 확인