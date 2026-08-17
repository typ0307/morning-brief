"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Provider = "google" | "kakao";

export default function LoginButtons() {
  const [loading, setLoading] = useState<Provider | null>(null);

  async function signIn(provider: Provider) {
    setLoading(provider);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setLoading(null);
      alert(`로그인에 실패했습니다: ${error.message}`);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={() => signIn("google")}
        disabled={loading !== null}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60"
      >
        Google로 로그인
      </button>
      <button
        onClick={() => signIn("kakao")}
        disabled={loading !== null}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#FEE500] font-medium text-[#191919] transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        Kakao로 로그인
      </button>
    </div>
  );
}
