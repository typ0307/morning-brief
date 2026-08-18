"use client";

import { useState } from "react";
import type { Provider as SupabaseProvider } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { generateNaverAuthUrl } from "@/lib/naver";

type Provider = "google" | "naver";

function GoogleLogo() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 48 48">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function NaverLogo() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24">
      <rect width="24" height="24" rx="6" fill="#03C75A" />
      <text
        x="12"
        y="17"
        textAnchor="middle"
        fontSize="14"
        fontWeight="700"
        fill="#fff"
      >
        N
      </text>
    </svg>
  );
}

const PROVIDERS: {
  id: Provider;
  label: string;
  className: string;
  logo: React.ReactNode;
}[] = [
  {
    id: "naver",
    label: "네이버로 시작하기",
    className: "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50",
    logo: <NaverLogo />,
  },
  {
    id: "google",
    label: "구글로 시작하기",
    className: "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50",
    logo: <GoogleLogo />,
  },
];

export default function LoginButtons() {
  const [loading, setLoading] = useState<Provider | null>(null);

  function signInNaver() {
    const state = crypto.randomUUID();
    const url = generateNaverAuthUrl({
      clientId: process.env.NEXT_PUBLIC_NAVER_CLIENT_ID!,
      redirectUri: `${window.location.origin}/auth/callback/naver`,
      state,
    });
    window.location.assign(url);
  }

  async function signIn(provider: Provider) {
    setLoading(provider);
    if (provider === "naver") {
      signInNaver();
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: provider as SupabaseProvider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setLoading(null);
      alert(`로그인에 실패했습니다: ${error.message}`);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {PROVIDERS.map((p) => (
        <button
          key={p.id}
          onClick={() => signIn(p.id)}
          disabled={loading !== null}
          className={`relative flex h-14 w-full items-center justify-center rounded-xl border text-base font-semibold transition-colors disabled:opacity-60 ${p.className}`}
        >
          <span className="absolute left-5">{p.logo}</span>
          <span>{loading === p.id ? "로그인 중..." : p.label}</span>
        </button>
      ))}
    </div>
  );
}
