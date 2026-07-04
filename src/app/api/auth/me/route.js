import { NextResponse } from "next/server";
import { AUTH_COOKIE, verifyAuthToken } from "@/lib/auth";

export async function GET(request) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const payload = await verifyAuthToken(token);
  if (!payload) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
  return NextResponse.json({
    user: { id: payload.sub, email: payload.email, name: payload.name },
  });
}
