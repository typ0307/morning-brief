export type NaverUserInfo = {
  id: string;
  email?: string;
  nickname?: string;
  name?: string;
  profile_image?: string;
};

export type NaverTokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
};

export function generateNaverAuthUrl({
  clientId,
  redirectUri,
  state,
}: {
  clientId: string;
  redirectUri: string;
  state: string;
}) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
  });
  return `https://nid.naver.com/oauth2.0/authorize?${params}`;
}

export async function exchangeNaverToken({
  clientId,
  clientSecret,
  code,
  state,
}: {
  clientId: string;
  clientSecret: string;
  code: string;
  state: string;
}): Promise<NaverTokenResponse> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    state,
  });
  const res = await fetch(`https://nid.naver.com/oauth2.0/token?${params}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("네이버 토큰 교환에 실패했습니다.");
  const data = (await res.json()) as NaverTokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (data.error) throw new Error(data.error_description ?? data.error);
  return data;
}

export async function getNaverUserInfo(
  accessToken: string
): Promise<NaverUserInfo> {
  const res = await fetch("https://openapi.naver.com/v1/nid/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("네이버 사용자 정보 조회에 실패했습니다.");
  const data = await res.json();
  if (data.resultcode !== "00") {
    throw new Error(`Naver API error: ${data.message}`);
  }
  return data.response as NaverUserInfo;
}
