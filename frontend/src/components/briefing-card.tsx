import type { BriefingRow } from "@/lib/types";

const SENTIMENT_LABEL: Record<string, string> = {
  positive: "긍정",
  neutral: "중립",
  negative: "부정",
};

const SENTIMENT_STYLE: Record<string, string> = {
  positive: "bg-emerald-100 text-emerald-700",
  neutral: "bg-zinc-100 text-zinc-600",
  negative: "bg-rose-100 text-rose-700",
};

export default function BriefingCard({ briefing }: { briefing: BriefingRow }) {
  const summary = briefing.summary ?? {};
  const keyword = briefing.topics?.keyword ?? "브리핑";
  const sentiment = summary.sentiment ?? "neutral";
  const lines = summary.summary ?? [];

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-700">
            {keyword}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              SENTIMENT_STYLE[sentiment] ?? SENTIMENT_STYLE.neutral
            }`}
          >
            {SENTIMENT_LABEL[sentiment] ?? sentiment}
          </span>
        </div>
        <time className="text-xs text-zinc-400">{briefing.brief_date}</time>
      </div>

      <h2 className="mb-2 text-lg font-semibold">
        {summary.title || `${keyword} 브리핑`}
      </h2>

      {lines.length > 0 && (
        <ul className="mb-4 flex flex-col gap-1.5">
          {lines
            .filter((s) => String(s).trim())
            .map((s, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-zinc-700">
                <span className="mt-0.5 text-zinc-400">•</span>
                <span>{s}</span>
              </li>
            ))}
        </ul>
      )}

      {briefing.articles && briefing.articles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-zinc-100 pt-3">
          {briefing.articles.map((a) => (
            <a
              key={a.url}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 transition-colors hover:border-zinc-400 hover:text-zinc-900"
            >
              {a.title || "기사"}
            </a>
          ))}
        </div>
      )}
    </article>
  );
}
