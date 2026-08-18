import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeNaverToken, getNaverUserInfo } from "@/lib/naver";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  try {
    const { access_token } = await exchangeNaverToken({
      clientId: process.env.NEXT_PUBLIC_NAVER_CLIENT_ID!,
      clientSecret: process.env.NAVER_CLIENT_SECRET!,
      code,
      state,
    });

    const naverUser = await getNaverUserInfo(access_token);
    if (!naverUser.email) {
      return NextResponse.redirect(`${origin}/login?error=auth`);
    }

    const admin = createAdminClient();

    const { data: list } = await admin.auth.admin.listUsers();
    let user = list?.users.find(
      (u) => u.user_metadata?.provider_id === naverUser.id
    );

    if (!user) {
      const { data, error } = await admin.auth.admin.createUser({
        email: naverUser.email,
        email_confirm: true,
        user_metadata: {
          full_name: naverUser.nickname ?? naverUser.name,
          avatar_url: naverUser.profile_image,
          provider_id: naverUser.id,
        },
      });
      if (error) throw error;
      user = data.user;
    }

    const { data: link } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: user.email!,
    });
    const actionLink = link?.properties?.action_link;
    if (!actionLink) throw new Error("매직 링크를 생성할 수 없습니다.");
    const token = new URL(actionLink).searchParams.get("token");
    if (!token) throw new Error("매직 링크 토큰을 추출할 수 없습니다.");

    const server = await createServerClient();
    const { error: verifyError } = await server.auth.verifyOtp({
      token_hash: token,
      type: "magiclink",
    });
    if (verifyError) throw verifyError;

    await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { provider: "naver", providers: ["naver"] },
    });

    return NextResponse.redirect(`${origin}/`);
  } catch (err) {
    console.error("Naver Login Error:", err);
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }
}
