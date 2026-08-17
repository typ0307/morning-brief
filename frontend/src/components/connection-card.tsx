import type { ReactNode } from "react";

export type ConnectionStatus =
  | "idle"
  | "creating"
  | "pending"
  | "linked"
  | "error";

type Props = {
  title: string;
  description: string;
  linkedDescription: string;
  status: ConnectionStatus;
  connectLabel: string;
  error: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  pendingContent?: ReactNode;
};

export default function ConnectionCard({
  title,
  description,
  linkedDescription,
  status,
  connectLabel,
  error,
  onConnect,
  onDisconnect,
  pendingContent,
}: Props) {
  const linked = status === "linked";
  const busy = status === "creating" || status === "pending";

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-zinc-600">
            {linked ? linkedDescription : description}
          </p>
          {status === "pending" && pendingContent}
          {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
        </div>

        <div className="flex w-36 shrink-0 flex-col gap-2">
          <button
            onClick={onConnect}
            disabled={linked || busy}
            className={`h-10 w-full rounded-lg text-sm font-medium transition-colors ${
              linked
                ? "bg-emerald-100 text-emerald-700"
                : "bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-50"
            }`}
          >
            {linked ? "연결됨" : busy ? "연결 대기 중..." : connectLabel}
          </button>
          <button
            onClick={onDisconnect}
            disabled={!linked}
            className="h-10 w-full rounded-lg border border-zinc-300 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-40"
          >
            연결 해제
          </button>
        </div>
      </div>
    </div>
  );
}
