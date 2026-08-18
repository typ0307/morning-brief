"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SendScheduleRow } from "@/lib/types";

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];

const DEFAULT_DAY_TIMES: Record<string, string[]> = {
  "0": ["08:00"],
  "1": ["08:00"],
  "2": ["08:00"],
  "3": ["08:00"],
  "4": ["08:00"],
};

type Props = {
  userId: string;
};

export default function ScheduleEditor({ userId }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [dayTimes, setDayTimes] = useState<Record<string, string[]>>({
    ...DEFAULT_DAY_TIMES,
  });
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("send_schedules")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const row = data as SendScheduleRow;
          setDayTimes(row.day_times ?? {});
          setEnabled(row.enabled);
        }
        setLoaded(true);
      });
  }, [userId]);

  function updateTime(day: string, index: number, value: string) {
    setDayTimes((prev) => ({
      ...prev,
      [day]: (prev[day] ?? []).map((t, i) => (i === index ? value : t)),
    }));
  }

  function addTime(day: string) {
    setDayTimes((prev) => ({
      ...prev,
      [day]: [...(prev[day] ?? []), "08:00"],
    }));
  }

  function removeTime(day: string, index: number) {
    setDayTimes((prev) => ({
      ...prev,
      [day]: (prev[day] ?? []).filter((_, i) => i !== index),
    }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    const { error: saveError } = await supabase
      .from("send_schedules")
      .upsert({ user_id: userId, day_times: dayTimes, enabled }, { onConflict: "user_id" });
    setSaving(false);
    if (saveError) {
      setError(`저장에 실패했습니다: ${saveError.message}`);
      return;
    }
    setMessage("저장되었습니다.");
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="font-semibold">발송 일정</h2>
      <p className="mt-1 text-sm text-zinc-600">
        요일별로 발송 시각을 지정합니다. 시각을 여러 개 추가하면 그 요일에는 여러
        번 받습니다. 시각이 없는 요일은 발송하지 않으며, 일정 자체가 없으면 예약
        발송을 받지 않습니다.
      </p>

      {!loaded ? (
        <p className="mt-3 text-sm text-zinc-500">불러오는 중...</p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            {WEEKDAYS.map((label, i) => {
              const day = String(i);
              const times = dayTimes[day] ?? [];
              return (
                <div key={day} className="flex items-start gap-3">
                  <span className="mt-2 w-8 shrink-0 text-sm font-medium text-zinc-700">
                    {label}
                  </span>
                  <div className="flex flex-1 flex-col gap-2">
                    {times.length === 0 ? (
                      <p className="text-sm text-zinc-400">발송 안 함</p>
                    ) : (
                      times.map((t, j) => (
                        <div key={j} className="flex items-center gap-2">
                          <input
                            type="time"
                            value={t}
                            onChange={(e) => updateTime(day, j, e.target.value)}
                            className="h-10 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-900"
                          />
                          <button
                            type="button"
                            onClick={() => removeTime(day, j)}
                            className="h-10 rounded-lg border border-zinc-300 px-3 text-sm text-zinc-600 transition-colors hover:bg-zinc-100"
                          >
                            삭제
                          </button>
                        </div>
                      ))
                    )}
                    <button
                      type="button"
                      onClick={() => addTime(day)}
                      className="w-fit rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 transition-colors hover:bg-zinc-100"
                    >
                      + 시각 추가
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            일정 활성화
          </label>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
            {message && <p className="text-sm text-emerald-600">{message}</p>}
            {error && <p className="text-sm text-rose-600">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
