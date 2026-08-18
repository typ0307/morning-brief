import Link from "next/link";
import LoginForm from "@/components/login-form";

export default async function EmailLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const mode =
    params.mode === "signup"
      ? "signup"
      : params.mode === "forgot"
        ? "forgot"
        : "login";

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="mx-auto w-full max-w-[600px] px-6 pt-6">
        <Link
          href="/login"
          aria-label="뒤로 가기"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-zinc-100"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              fill="currentColor"
              d="M15.598 3.338a.75.75 0 0 0-1.061 0l-8.132 8.131a.75.75 0 0 0 0 1.061l8.132 8.132a.75.75 0 0 0 1.06-1.06L7.998 12l7.6-7.602a.75.75 0 0 0 0-1.06"
            />
          </svg>
        </Link>
      </div>
      <div className="mx-auto w-full max-w-[600px] flex-1 px-6 pb-12 pt-2">
        <LoginForm initialMode={mode} />
      </div>
    </div>
  );
}
