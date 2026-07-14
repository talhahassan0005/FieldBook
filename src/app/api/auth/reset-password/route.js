import crypto from "crypto";
import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { hashPassword } from "@/lib/auth";

/**
 * Step 2 of the forgot-password flow: the user arrives here via the emailed
 * link (carrying the raw token) and submits a new password. The token is
 * hashed and compared to the stored hash, and must not have expired — this
 * is what actually proves the requester owns the email account, unlike the
 * old version of this route which reset a password from the email alone.
 */
export async function POST(request) {
  try {
    await dbConnect();
    const body = await request.json();
    const email = (body.email || "").trim().toLowerCase();
    const token = body.token || "";
    const password = body.password || "";

    if (!email || !token || !password) {
      return NextResponse.json({ error: "Email, token and new password are required" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    const user = await User.findOne({ email });
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const valid =
      user &&
      user.resetPasswordTokenHash &&
      user.resetPasswordExpires &&
      user.resetPasswordExpires.getTime() > Date.now() &&
      // Constant-time compare to avoid leaking the hash via response timing.
      user.resetPasswordTokenHash.length === tokenHash.length &&
      crypto.timingSafeEqual(Buffer.from(user.resetPasswordTokenHash), Buffer.from(tokenHash));

    if (!valid) {
      return NextResponse.json(
        { error: "This reset link is invalid or has expired. Request a new one." },
        { status: 400 }
      );
    }

    user.passwordHash = await hashPassword(password);
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpires = null;
    await user.save();

    return NextResponse.json({ message: "Password updated successfully" }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
