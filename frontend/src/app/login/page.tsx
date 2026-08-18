import Link from "next/link";
import LoginButtons from "@/components/login-buttons";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const notice =
    params.confirmed === "1"
      ? "이메일 인증이 완료되었습니다. 로그인해 주세요."
      : params.password_reset === "1"
        ? "비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요."
        : null;
  const error =
    params.error === "auth"
      ? "로그인에 실패했습니다. 다시 시도해 주세요."
      : null;

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="mx-auto flex w-full max-w-[600px] flex-1 flex-col justify-center px-6 py-12">
        <div className="mb-10 flex flex-col items-center gap-3">
          <h1 className="text-3xl font-bold text-zinc-900">모닝브리프</h1>
          <p className="text-center text-sm text-zinc-500">
            출근길 뉴스 요약을 받아보세요
          </p>
        </div>

        {error && (
          <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            {error}
          </p>
        )}
        {notice && (
          <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-600">
            {notice}
          </p>
        )}

        <LoginButtons />

        <Link
          href="/login/email"
          className="flex items-center justify-center gap-1.5 py-4 text-base font-semibold text-zinc-900 transition-colors hover:text-zinc-500"
        >
          이메일로 시작하기
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              fill="currentColor"
              d="M9.884 4.116a1.25 1.25 0 1 0-1.768 1.768L14.232 12l-6.116 6.116a1.25 1.25 0 1 0 1.768 1.768l7-7a1.25 1.25 0 0 0 0-1.768z"
            />
          </svg>
        </Link>

        <div className="mb-8 flex items-center gap-3 text-xs text-zinc-400">
          <hr className="flex-1 border-zinc-200" />
          <span>또는</span>
          <hr className="flex-1 border-zinc-200" />
        </div>

        <div className="flex items-center justify-center gap-3 text-sm">
          <Link
            href="/login/email?mode=forgot"
            className="text-zinc-500 underline underline-offset-4 hover:text-zinc-700"
          >
            비밀번호 찾기
          </Link>
          <span className="text-zinc-300">|</span>
          <Link
            href="/login/email?mode=signup"
            className="text-zinc-500 underline underline-offset-4 hover:text-zinc-700"
          >
            회원가입
          </Link>
        </div>
      </div>
    </div>
  );
}
