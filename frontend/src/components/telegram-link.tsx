"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(length = 8): string {
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[arr[i] % CODE_CHARS.length];
  }
  return code;
}

type Props = {
  userId: string;
  authUserId: string;
  telegramChatId: string | null;
  botUsername: string | null;
};

type Status = "idle" | "creating" | "pending" | "linked" | "error";

export default function TelegramLink({
  userId,
  authUserId,
  telegramChatId,
  botUsername,
}: Props) {
  const [status, setStatus] = useState<Status>(
    telegramChatId ? "linked" : "idle"
  );
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const checkLinked = useCallback(async (): Promise<boolean> => {
    const supabase = createClient();
    const { data } = await supabase
      .from("users")
      .select("telegram_chat_id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (data?.telegram_chat_id) {
      setStatus("linked");
      stopPolling();
      return true;
    }
    return false;
  }, [authUserId, stopPolling]);

  useEffect(() => {
    if (status !== "pending") return;
    const onFocus = () => {
      checkLinked();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [status, checkLinked]);

  async function connect() {
    if (!botUsername) {
      setError(
        "NEXT_PUBLIC_TELEGRAM_BOT_USERNAME 환경변수가 설정되지 않았습니다."
      );
      return;
    }

    setStatus("creating");
    setError(null);
    const supabase = createClient();
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: insertError } = await supabase.from("link_codes").insert({
      user_id: userId,
      code,
      channel: "telegram",
      expires_at: expiresAt,
    });

    if (insertError) {
      setStatus("error");
      setError(`연결 코드 생성에 실패했습니다: ${insertError.message}`);
      return;
    }

    const url = `https://t.me/${botUsername}?start=${code}`;
    setLinkUrl(url);
    window.open(url, "_blank", "noopener");

    setStatus("pending");
    stopPolling();
    intervalRef.current = setInterval(async () => {
      const linked = await checkLinked();
      if (linked) stopPolling();
    }, 5000);
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">텔레그램 연결</h2>
        {status === "linked" && (
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
            연결됨
          </span>
        )}
      </div>

      {status === "linked" ? (
        <p className="text-sm text-zinc-600">
          텔레그램 계정이 연결되었습니다. 이제 브리핑을 텔레그램으로 받아볼 수
          있습니다.
        </p>
      ) : (
        <>
          <p className="mb-4 text-sm text-zinc-600">
            텔레그램 봇과 계정을 연결하면 매일 아침 브리핑을 받아볼 수 있습니다.
          </p>
          <button
            onClick={connect}
            disabled={status === "creating" || status === "pending"}
            className="h-11 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
          >
            {status === "creating"
              ? "코드 생성 중..."
              : status === "pending"
                ? "연결 대기 중..."
                : "텔레그램 연결"}
          </button>

          {status === "pending" && linkUrl && (
            <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
              <p className="mb-2">
                새 창이 열리지 않았다면 아래 링크를 눌러 봇에 &lsquo;시작&rsquo;
                메시지를 보내세요.
              </p>
              <a
                href={linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline"
              >
                {linkUrl}
              </a>
              <p className="mt-2 text-xs text-blue-600">
                봇에 연결 메시지를 보내면 자동으로 완료됩니다.
              </p>
            </div>
          )}

          {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        </>
      )}
    </div>
  );
}
