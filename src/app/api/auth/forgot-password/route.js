import crypto from "crypto";
import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { sendPasswordResetEmail } from "@/lib/mailer";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Step 1 of the forgot-password flow: the user submits only their email.
 * We generate a random token, store its HASH (+ expiry) on the user, and
 * email them a link containing the RAW token. Always respond with the same
 * generic message whether or not the email exists — otherwise this endpoint
 * could be used to check which emails have an account (user enumeration).
 */
export async function POST(request) {
  try {
    await dbConnect();
    const body = await request.json();
    const email = (body.email || "").trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const genericResponse = {
      message: "If an account exists for that email, a password reset link has been sent.",
    };

    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal whether the account exists.
      return NextResponse.json(genericResponse, { status: 200 });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    user.resetPasswordTokenHash = tokenHash;
    user.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await user.save();

    const baseUrl = process.env.APP_BASE_URL || request.nextUrl.origin;
    const resetUrl = `${baseUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;

    try {
      await sendPasswordResetEmail(email, resetUrl);
    } catch (mailErr) {
      // Roll back the token so a failed send doesn't leave a dangling,
      // unusable reset window; surface a real error instead of a false "sent".
      user.resetPasswordTokenHash = null;
      user.resetPasswordExpires = null;
      await user.save();
      throw mailErr;
    }

    return NextResponse.json(genericResponse, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
