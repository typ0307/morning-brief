"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export async function checkEmailRegistered(
  email: string,
): Promise<{ registered: boolean }> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const registered = data?.users.some(
      (u) => u.email?.toLowerCase() === email.trim().toLowerCase(),
    );
    return { registered: Boolean(registered) };
  } catch (err) {
    console.error("checkEmailRegistered error:", err);
    return { registered: false };
  }
}
