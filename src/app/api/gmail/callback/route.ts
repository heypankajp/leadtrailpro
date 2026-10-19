import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getRequestUser } from "@/features/users/session";
import { emailFromIdToken, exchangeCode, gmailStateCookie, saveConnection } from "@/features/gmail/gmail";

export async function GET(request: Request) {
  const home = (status: string) => NextResponse.redirect(new URL(`/?gmail=${status}`, request.url));
  const user = await getRequestUser();
  if (!user) return NextResponse.redirect(new URL("/", request.url));
  const jar = await cookies();
  const expected = jar.get(gmailStateCookie)?.value;
  jar.delete({ name: gmailStateCookie, path: "/api/gmail" });
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  if (!expected || params.get("state") !== expected || !code) return home("denied");

  try {
    const tokens = await exchangeCode(code, request);
    const googleEmail = emailFromIdToken(tokens.id_token);
    if (!tokens.refresh_token || !googleEmail) return home("failed");
    await saveConnection(user.id, googleEmail, tokens.refresh_token);
    return home("connected");
  } catch (error) {
    console.error("Failed to connect Gmail.", error instanceof Error ? error.name : "Unknown error");
    return home("failed");
  }
}
