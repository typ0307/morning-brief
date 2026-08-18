"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Turnstile, { isTurnstileEnabled } from "@/components/turnstile";

type Mode = "login" | "signup" | "forgot";

type Props = { initialMode?: Mode };

const TITLES: Record<Mode, string> = {
  login: "이메일로 로그인해 주세요",
  signup: "이메일로 가입해 주세요",
  forgot: "비밀번호를 재설정해 주세요",
};

export default function LoginForm({ initialMode = "login" }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaNonce, setCaptchaNonce] = useState(0);

  function resetCaptcha() {
    setCaptchaToken(null);
    setCaptchaNonce((n) => n + 1);
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setInfo(null);
    setPassword("");
    resetCaptcha();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!email.trim()) return setError("이메일을 입력해 주세요.");
    if (mode !== "forgot" && password.length < 8)
      return setError("비밀번호는 8자 이상이어야 합니다.");
    if (isTurnstileEnabled && !captchaToken)
      return setError("로봇 확인을 완료해 주세요.");

    setLoading(true);
    const supabase = createClient();

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: { captchaToken: captchaToken ?? undefined },
      });
      setLoading(false);
      if (error) {
        resetCaptcha();
        return setError(error.message);
      }
      router.push("/");
      router.refresh();
    } else if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          captchaToken: captchaToken ?? undefined,
          emailRedirectTo: `${window.location.origin}/login?confirmed=1`,
        },
      });
      setLoading(false);
      if (error) {
        resetCaptcha();
        return setError(error.message);
      }
      setPassword("");
      setInfo(
        "확인 이메일을 보냈습니다. 이메일 링크로 인증한 뒤 로그인해 주세요.",
      );
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        captchaToken: captchaToken ?? undefined,
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      setLoading(false);
      if (error) {
        resetCaptcha();
        setError(error.message);
      } else {
        setInfo("비밀번호 재설정 링크를 이메일로 보냈습니다.");
      }
    }
  }

  const captchaRequired = isTurnstileEnabled && !captchaToken;

  return (
    <div className="flex flex-col">
      <h1 className="mb-8 text-2xl font-bold text-zinc-900">
        {TITLES[mode]}
      </h1>

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <label className="block">
          <span className="mb-2 block px-1 text-sm font-semibold text-zinc-700">
            이메일(아이디)
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            autoFocus
            className="h-14 w-full rounded-xl border border-zinc-300 bg-white px-4 text-base outline-none placeholder:text-zinc-400 focus:border-zinc-900"
          />
        </label>

        {mode !== "forgot" && (
          <label className="block">
            <span className="mb-2 block px-1 text-sm font-semibold text-zinc-700">
              비밀번호
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8자 이상"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="h-14 w-full rounded-xl border border-zinc-300 bg-white px-4 text-base outline-none placeholder:text-zinc-400 focus:border-zinc-900"
            />
          </label>
        )}

        {isTurnstileEnabled && (
          <Turnstile key={captchaNonce} onToken={setCaptchaToken} />
        )}

        {error && <p className="text-sm text-rose-600">{error}</p>}
        {info && <p className="text-sm text-emerald-600">{info}</p>}
        {captchaRequired && !loading && (
          <p className="text-xs text-zinc-400">
            로봇 확인을 완료하면 버튼이 활성화됩니다.
          </p>
        )}

        <button
          type="submit"
          disabled={loading || captchaRequired}
          className="h-14 w-full rounded-xl bg-zinc-900 text-base font-semibold text-white transition-colors hover:bg-zinc-700 disabled:opacity-60"
        >
          {loading
            ? "처리 중..."
            : mode === "login"
              ? "로그인하기"
              : mode === "signup"
                ? "가입하기"
                : "입력 완료"}
        </button>

        {mode !== "forgot" && (
          <button
            type="button"
            onClick={() => switchMode(mode === "login" ? "signup" : "login")}
            className="h-14 w-full rounded-xl border border-zinc-300 bg-white text-base font-semibold text-zinc-900 transition-colors hover:bg-zinc-50"
          >
            {mode === "login"
              ? "이메일로 가입하기"
              : "이미 계정이 있나요? 로그인"}
          </button>
        )}

        <div className="mt-2 flex items-center justify-center text-sm">
          {mode === "forgot" ? (
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="text-zinc-500 underline underline-offset-4 hover:text-zinc-700"
            >
              로그인으로 돌아가기
            </button>
          ) : (
            <button
              type="button"
              onClick={() => switchMode("forgot")}
              className="text-zinc-500 underline underline-offset-4 hover:text-zinc-700"
            >
              비밀번호 재설정
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
