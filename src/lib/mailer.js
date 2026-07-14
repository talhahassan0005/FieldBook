import nodemailer from "nodemailer";

/**
 * Gmail SMTP transporter (credentials in .env.local — never hardcode these).
 * Cached across invocations the same way dbConnect() caches its connection,
 * so we don't re-authenticate with Gmail on every email sent.
 */
let cachedTransporter = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_USER || !SMTP_PASS) {
    throw new Error("SMTP_USER / SMTP_PASS are not set — copy .env.example to .env.local and configure email sending.");
  }
  cachedTransporter = nodemailer.createTransport({
    host: SMTP_HOST || "smtp.gmail.com",
    port: Number(SMTP_PORT) || 465,
    secure: true, // true for port 465
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return cachedTransporter;
}

/** Send the "reset your password" email with a tokenised link. */
export async function sendPasswordResetEmail(toEmail, resetUrl) {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"Cadastral Field Book" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: "Reset your Cadastral Field Book password",
    text: `We received a request to reset your password.\n\nClick the link below to choose a new password (this link expires in 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email — your password won't change.`,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1e293b;">
        <h2 style="margin:0 0 12px;color:#0f172a;">Reset your password</h2>
        <p style="margin:0 0 16px;line-height:1.5;">
          We received a request to reset the password for your Cadastral Field Book account.
        </p>
        <p style="margin:0 0 24px;">
          <a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600;">
            Reset password
          </a>
        </p>
        <p style="margin:0 0 8px;line-height:1.5;font-size:13px;color:#64748b;">
          This link expires in 1 hour. If the button doesn't work, copy and paste this URL into your browser:<br/>
          <span style="word-break:break-all;">${resetUrl}</span>
        </p>
        <p style="margin:16px 0 0;line-height:1.5;font-size:13px;color:#64748b;">
          If you didn't request this, you can safely ignore this email — your password won't change.
        </p>
      </div>
    `,
  });
}
