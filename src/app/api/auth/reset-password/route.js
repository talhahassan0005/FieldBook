import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { hashPassword } from "@/lib/auth";

export async function POST(request) {
  try {
    await dbConnect();
    const body = await request.json();
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";

    if (!email || !password) {
      return NextResponse.json({ error: "Email and new password are required" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const user = await User.findOne({ email });
    if (!user) {
      return NextResponse.json({ error: "No account found for that email" }, { status: 404 });
    }

    user.passwordHash = await hashPassword(password);
    await user.save();

    return NextResponse.json({ message: "Password updated successfully" }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}