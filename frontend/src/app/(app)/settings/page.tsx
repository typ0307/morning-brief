import { getCurrentUser } from "@/lib/auth";
import TelegramLink from "@/components/telegram-link";
import DiscordLink from "@/components/discord-link";
import ScheduleEditor from "@/components/schedule-editor";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { row } = await getCurrentUser();
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? null;
  const discordInviteUrl =
    process.env.NEXT_PUBLIC_DISCORD_BOT_INVITE_URL ?? null;

  if (!row) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        사용자 정보를 찾을 수 없습니다. 잠시 후 다시 시도해 주세요.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">설정</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          계정 연결
        </h2>
        <div className="flex flex-col gap-4">
          <TelegramLink
            userId={row.id}
            authUserId={row.auth_user_id ?? ""}
            telegramChatId={row.telegram_chat_id ?? null}
            botUsername={botUsername}
          />
          <DiscordLink
            userId={row.id}
            authUserId={row.auth_user_id ?? ""}
            discordUserId={row.discord_user_id ?? null}
            inviteUrl={discordInviteUrl}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          발송 일정
        </h2>
        <ScheduleEditor userId={row.id} />
      </section>
    </div>
  );
}
