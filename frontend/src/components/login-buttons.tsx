"use client";

import { useState } from "react";
import type { Provider as SupabaseProvider } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { generateNaverAuthUrl } from "@/lib/naver";

type Provider = "google" | "kakao" | "naver" | "apple";

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

function KakaoLogo() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24">
      <path
        fill="#191919"
        d="M12 3C6.48 3 2 6.58 2 11c0 2.39 1.23 4.5 3.16 5.9L4.2 20.5c-.1.3.2.57.5.44l4.7-2.4c.86.22 1.73.33 2.6.33 5.52 0 10-3.58 10-8S17.52 3 12 3z"
      />
    </svg>
  );
}

function AppleLogo() {
  return (
    <svg className="h-5 w-5 fill-current" viewBox="0 0 384 512">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zM262 104.5c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
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
    id: "kakao",
    label: "카카오로 시작하기",
    className:
      "border-transparent bg-[#FEE500] text-[#191919] hover:brightness-95",
    logo: <KakaoLogo />,
  },
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
  {
    id: "apple",
    label: "애플로 시작하기",
    className: "border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50",
    logo: <AppleLogo />,
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
      {PROVIDERS.filter((p) => p.id !== "kakao").map((p) => (
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
