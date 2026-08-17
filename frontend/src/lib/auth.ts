import { createClient } from "@/lib/supabase/server";

export type CurrentUserRow = {
  id: string;
  auth_user_id: string | null;
  telegram_chat_id: string | null;
  discord_user_id: string | null;
};

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, row: null };
  }

  const { data: row } = await supabase
    .from("users")
    .select("id, auth_user_id, telegram_chat_id, discord_user_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return {
    supabase,
    user,
    row: row as CurrentUserRow | null,
  };
}
