"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8)
      return setError("비밀번호는 8자 이상이어야 합니다.");
    if (password !== confirm)
      return setError("비밀번호가 일치하지 않습니다.");

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return setError(error.message);
    router.push("/login?password_reset=1");
  }

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
        <h1 className="mb-8 text-2xl font-bold text-zinc-900">
          새 비밀번호를 설정해 주세요
        </h1>

        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <label className="block">
            <span className="mb-2 block px-1 text-sm font-semibold text-zinc-700">
              새 비밀번호
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8자 이상"
              autoComplete="new-password"
              autoFocus
              className="h-14 w-full rounded-xl border border-zinc-300 bg-white px-4 text-base outline-none placeholder:text-zinc-400 focus:border-zinc-900"
            />
          </label>
          <label className="block">
            <span className="mb-2 block px-1 text-sm font-semibold text-zinc-700">
              비밀번호 확인
            </span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="8자 이상"
              autoComplete="new-password"
              className="h-14 w-full rounded-xl border border-zinc-300 bg-white px-4 text-base outline-none placeholder:text-zinc-400 focus:border-zinc-900"
            />
          </label>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="h-14 w-full rounded-xl bg-zinc-900 text-base font-semibold text-white transition-colors hover:bg-zinc-700 disabled:opacity-60"
          >
            {loading ? "처리 중..." : "비밀번호 변경"}
          </button>
        </form>
      </div>
    </div>
  );
}
