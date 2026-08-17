"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { generateCode } from "@/lib/code";
import ConnectionCard, {
  type ConnectionStatus,
} from "@/components/connection-card";

type Props = {
  userId: string;
  authUserId: string;
  discordUserId: string | null;
  inviteUrl: string | null;
};

export default function DiscordLink({
  userId,
  authUserId,
  discordUserId,
  inviteUrl,
}: Props) {
  const [status, setStatus] = useState<ConnectionStatus>(
    discordUserId ? "linked" : "idle"
  );
  const [code, setCode] = useState<string | null>(null);
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
      .select("discord_user_id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (data?.discord_user_id) {
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
    setStatus("creating");
    setError(null);
    const supabase = createClient();
    const newCode = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: insertError } = await supabase.from("link_codes").insert({
      user_id: userId,
      code: newCode,
      channel: "discord",
      expires_at: expiresAt,
    });

    if (insertError) {
      setStatus("error");
      setError(`연결 코드 생성에 실패했습니다: ${insertError.message}`);
      return;
    }

    setCode(newCode);
    setStatus("pending");
    stopPolling();
    intervalRef.current = setInterval(async () => {
      const linked = await checkLinked();
      if (linked) stopPolling();
    }, 5000);
  }

  async function disconnect() {
    const supabase = createClient();
    await supabase
      .from("users")
      .update({ discord_user_id: null })
      .eq("auth_user_id", authUserId);
    setStatus("idle");
    setCode(null);
    stopPolling();
  }

  return (
    <ConnectionCard
      title="디스코드"
      description="디스코드 봇에 코드를 입력하면 계정이 연결됩니다."
      linkedDescription="디스코드 계정이 연결되었습니다."
      status={status}
      connectLabel="디스코드 연결"
      error={error}
      onConnect={connect}
      onDisconnect={disconnect}
      pendingContent={
        code ? (
          <div className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
            <p className="mb-2">
              디스코드 봇의 DM으로 다음 코드를 보내면 계정이 연결됩니다.
            </p>
            <p className="font-mono text-lg font-bold tracking-widest">
              {code}
            </p>
            {inviteUrl && (
              <a
                href={inviteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block font-medium underline"
              >
                봇 초대 링크 (서버에 봇 추가 후 DM으로 코드 전송)
              </a>
            )}
            <p className="mt-2 text-xs text-blue-600">
              봇과 같은 서버가 없으면 DM을 받을 수 없습니다.
            </p>
          </div>
        ) : undefined
      }
    />
  );
}
