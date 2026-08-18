"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SendScheduleRow } from "@/lib/types";

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];
const WEEKDAY_KEYS = ["0", "1", "2", "3", "4"];
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) =>
  String(i).padStart(2, "0"),
);

type DayTimes = Record<string, string[]>;

const DEFAULT_DAY_TIMES: DayTimes = {
  "0": ["08:00"],
  "1": ["08:00"],
  "2": ["08:00"],
  "3": ["08:00"],
  "4": ["08:00"],
};

function normalize(dt: DayTimes): DayTimes {
  const next: DayTimes = {};
  for (const [day, times] of Object.entries(dt ?? {})) {
    const arr = [...new Set(times)].sort();
    if (arr.length) next[day] = arr;
  }
  return next;
}

function toRows(dayTimes: DayTimes): { time: string; days: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const [day, times] of Object.entries(dayTimes)) {
    for (const t of times) {
      const list = groups.get(t) ?? [];
      list.push(day);
      groups.set(t, list);
    }
  }
  return [...groups.entries()]
    .map(([time, days]) => ({
      time,
      days: [...new Set(days)].sort((a, b) => Number(a) - Number(b)),
    }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

function shiftTime(t: string, deltaMinutes: number): string {
  const [h, m] = t.split(":").map(Number);
  const total = (h * 60 + m + deltaMinutes + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

type Props = {
  userId: string;
};

export default function ScheduleEditor({ userId }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [dayTimes, setDayTimes] = useState<DayTimes>({ ...DEFAULT_DAY_TIMES });
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("send_schedules")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as SendScheduleRow | null;
        const dt = normalize(row?.day_times ?? {});
        const isEnabled = row?.enabled ?? true;
        setDayTimes(dt);
        setEnabled(isEnabled);
        setSavedSnapshot(JSON.stringify({ day_times: dt, enabled: isEnabled }));
        setLoaded(true);
      });
  }, [userId]);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const rows = toRows(dayTimes);
  const dirty =
    loaded &&
    JSON.stringify({ day_times: dayTimes, enabled }) !== savedSnapshot;

  function showToast(text: string) {
    setMessage(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setMessage(null), 3000);
  }

  function toggleDay(time: string, day: string) {
    setDayTimes((prev) => {
      const next: DayTimes = { ...prev };
      const current = next[day] ?? [];
      next[day] = current.includes(time)
        ? current.filter((t) => t !== time)
        : [...current, time].sort();
      if (!next[day].length) delete next[day];
      return next;
    });
  }

  function changeTime(oldTime: string, newValue: string) {
    if (!/^\d{2}:\d{2}$/.test(newValue) || newValue === oldTime) return;
    setDayTimes((prev) => {
      const next: DayTimes = {};
      for (const [day, times] of Object.entries(prev)) {
        const mapped = [
          ...new Set(times.map((t) => (t === oldTime ? newValue : t))),
        ].sort();
        if (mapped.length) next[day] = mapped;
      }
      return next;
    });
  }

  function addTime() {
    setDayTimes((prev) => {
      const existing = new Set(Object.values(prev).flat());
      const sorted = [...existing].sort();
      let candidate = sorted.length
        ? shiftTime(sorted[sorted.length - 1], 60)
        : "08:00";
      while (existing.has(candidate)) candidate = shiftTime(candidate, 60);
      const next: DayTimes = { ...prev };
      for (const day of WEEKDAY_KEYS) {
        next[day] = [...(next[day] ?? []), candidate].sort();
      }
      return next;
    });
  }

  function removeTime(time: string) {
    setDayTimes((prev) => {
      const next: DayTimes = {};
      for (const [day, times] of Object.entries(prev)) {
        const rest = times.filter((t) => t !== time);
        if (rest.length) next[day] = rest;
      }
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const payload = { user_id: userId, day_times: dayTimes, enabled };
    const { error: saveError } = await supabase
      .from("send_schedules")
      .upsert(payload, { onConflict: "user_id" });
    setSaving(false);
    if (saveError) {
      setError(`저장에 실패했습니다: ${saveError.message}`);
      return;
    }
    setSavedSnapshot(JSON.stringify(payload));
    showToast("저장되었습니다.");
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white">
      <div className="flex items-start justify-between gap-4 p-5 pb-4">
        <p className="text-sm text-zinc-600">
          시각별로 받을 요일을 선택하세요. 시각이 여러 개면 그만큼 여러 번
          받습니다.
        </p>
        <label className="flex shrink-0 items-center gap-2 text-sm text-zinc-600">
          <span className="text-xs">{enabled ? "켜짐" : "꺼짐"}</span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled((v) => !v)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              enabled ? "bg-zinc-900" : "bg-zinc-300"
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                enabled ? "translate-x-5" : ""
              }`}
            />
          </button>
        </label>
      </div>

      {!loaded ? (
        <p className="px-5 pb-5 text-sm text-zinc-500">불러오는 중...</p>
      ) : (
        <div className="flex flex-col gap-3 px-5 pb-5">
          <div className="overflow-hidden rounded-lg border border-zinc-200">
            {rows.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-zinc-400">
                지정된 발송 시각이 없습니다. 아래에서 시각을 추가하세요.
              </div>
            ) : (
              rows.map((row) => {
                const [hh, mm] = row.time.split(":");
                return (
                  <div
                    key={row.time}
                    className="flex items-center gap-3 border-b border-zinc-100 px-3 py-2 last:border-b-0"
                  >
                    <div className="flex items-center gap-1">
                      <select
                        value={hh}
                        onChange={(e) =>
                          changeTime(row.time, `${e.target.value}:${mm}`)
                        }
                        className="h-9 w-14 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 text-sm font-medium tabular-nums outline-none focus:border-zinc-900"
                      >
                        {HOURS.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                      <span className="text-sm text-zinc-400">:</span>
                      <select
                        value={mm}
                        onChange={(e) =>
                          changeTime(row.time, `${hh}:${e.target.value}`)
                        }
                        className="h-9 w-14 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 text-sm font-medium tabular-nums outline-none focus:border-zinc-900"
                      >
                        {MINUTES.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-1 overflow-hidden rounded-lg border border-zinc-200">
                      {WEEKDAYS.map((label, i) => {
                        const day = String(i);
                        const selected = row.days.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => toggleDay(row.time, day)}
                            aria-pressed={selected}
                            className={`h-9 flex-1 border-r border-zinc-200 text-xs font-medium transition-colors last:border-r-0 ${
                              selected
                                ? "bg-zinc-900 text-white"
                                : "bg-white text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => removeTime(row.time)}
                      aria-label={`${row.time} 삭제`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                    >
                      ✕
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <button
            type="button"
            onClick={addTime}
            className="h-9 w-fit rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
          >
            + 발송 시각
          </button>
        </div>
      )}

      <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-b-xl border-t border-zinc-100 bg-white/95 px-5 py-3 backdrop-blur">
        <span className="text-xs text-zinc-400">
          {dirty
            ? "저장되지 않은 변경사항이 있습니다"
            : "모든 변경사항이 저장되었습니다"}
        </span>
        <div className="flex items-center gap-3">
          {message && (
            <span className="text-sm text-emerald-600">{message}</span>
          )}
          {error && <span className="text-sm text-rose-600">{error}</span>}
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className={`h-9 rounded-lg px-4 text-sm font-medium text-white transition-colors disabled:opacity-40 ${
              dirty ? "bg-zinc-900 hover:bg-zinc-700" : "bg-zinc-400"
            }`}
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
