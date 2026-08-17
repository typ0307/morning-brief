import { getCurrentUser } from "@/lib/auth";
import TelegramLink from "@/components/telegram-link";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { row } = await getCurrentUser();
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? null;

  if (!row) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        사용자 정보를 찾을 수 없습니다. 잠시 후 다시 시도해 주세요.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="mb-4 text-xl font-bold">설정</h1>
        <TelegramLink
          userId={row.id}
          authUserId={row.auth_user_id ?? ""}
          telegramChatId={row.telegram_chat_id ?? null}
          botUsername={botUsername}
        />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 font-semibold">디스코드 연결</h2>
        <p className="text-sm text-zinc-500">준비 중입니다.</p>
      </div>
    </div>
  );
}
