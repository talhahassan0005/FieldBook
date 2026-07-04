import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { verifyPassword, signAuthToken, AUTH_COOKIE, AUTH_COOKIE_OPTIONS } from "@/lib/auth";

export async function POST(request) {
  try {
    await dbConnect();
    const body = await request.json();
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const user = await User.findOne({ email });
    // Same error for "no such user" and "wrong password" — don't leak which
    // one it was.
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const token = await signAuthToken(user);
    const res = NextResponse.json({ id: user._id, name: user.name, email: user.email });
    res.cookies.set(AUTH_COOKIE, token, AUTH_COOKIE_OPTIONS);
    return res;
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
