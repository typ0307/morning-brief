"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { subscribeKeywords } from "@/lib/subscribe";

const MAX_CHIPS = 10;

type Props = {
  userId: string;
  existingKeywords: string[];
};

export default function SubscribeForm({ userId, existingKeywords }: Props) {
  const [chips, setChips] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  const existingSet = new Set(
    existingKeywords.map((k) => k.trim().toLowerCase()),
  );

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  function showToast(text: string) {
    setMessage(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setMessage(null), 3000);
  }

  function mergeChips(prev: string[], parts: string[]) {
    const merged = [...prev];
    let truncated = false;
    for (const part of parts) {
      if (merged.some((c) => c.toLowerCase() === part.toLowerCase())) {
        continue;
      }
      if (merged.length >= MAX_CHIPS) {
        truncated = true;
        break;
      }
      merged.push(part);
    }
    return { merged, truncated };
  }

  function splitInput(value: string) {
    return value
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
  }

  function addChips(raw: string): boolean {
    const parts = splitInput(raw);
    if (parts.length === 0) return false;

    setChips((prev) => {
      const { merged, truncated } = mergeChips(prev, parts);
      if (truncated) showToast("최대 10개까지 추가할 수 있습니다.");
      return merged;
    });
    return true;
  }

  function commitInput() {
    if (!input.trim()) return;
    if (addChips(input)) setInput("");
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    if (value.includes(",")) {
      addChips(value);
      setInput("");
    } else {
      setInput(value);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter") {
      e.preventDefault();
      commitInput();
    } else if (e.key === ",") {
      e.preventDefault();
      commitInput();
    } else if (e.key === "Backspace" && !input && chips.length > 0) {
      setChips((prev) => prev.slice(0, -1));
    }
  }

  function removeChip(keyword: string) {
    setChips((prev) => prev.filter((c) => c !== keyword));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { merged, truncated } = mergeChips(chips, splitInput(input));
    if (truncated) showToast("최대 10개까지 추가할 수 있습니다.");
    if (merged.length === 0) return;

    setChips(merged);
    setInput("");
    setSubmitting(true);
    setError(null);
    const result = await subscribeKeywords(userId, merged);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setChips([]);
    setInput("");
    if (result.added === 0) {
      showToast("이미 구독 중인 키워드입니다.");
    } else if (result.already > 0) {
      showToast(
        `${result.added}개 추가, ${result.already}개는 이미 구독 중입니다.`,
      );
    } else {
      showToast(`${result.added}개 추가되었습니다.`);
    }
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={input}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder="새 키워드 (예: 애플, AI)"
          className="h-11 flex-1 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-900"
        />
        <button
          type="submit"
          disabled={submitting || chips.length === 0}
          className="h-11 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
        >
          {submitting ? "추가 중..." : "추가"}
        </button>
      </div>

      <p className="text-xs text-zinc-400">
        엔터 또는 콤마로 구분해 최대 10개까지 추가할 수 있습니다.
      </p>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => {
            const subscribed = existingSet.has(chip.toLowerCase());
            return (
              <span
                key={chip}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${
                  subscribed
                    ? "border-zinc-200 bg-zinc-100 text-zinc-400"
                    : "border-zinc-300 bg-white text-zinc-700"
                }`}
              >
                {chip}
                {subscribed && (
                  <span className="text-[10px] font-normal">이미 구독 중</span>
                )}
                <button
                  type="button"
                  onClick={() => removeChip(chip)}
                  aria-label={`${chip} 제거`}
                  className="ml-0.5 text-zinc-400 transition-colors hover:text-zinc-700"
                >
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      )}

      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </form>
  );
}
