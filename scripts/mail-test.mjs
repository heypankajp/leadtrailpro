/**
 * Checks the SMTP_* settings the app uses for password resets, set-password links, and two-factor codes without
 * going through the app: connects, signs in, and with --send delivers a test message.
 *
 *   npm run mail:test                            # connect and sign in only
 *   npm run mail:test -- --send                  # also send a test email to SMTP_USER
 *   npm run mail:test -- --send you@example.com  # ...or to another address
 *
 * Reads the same variables as src/lib/mailer.ts; the npm script loads them from .env.local. Inside Docker:
 *   docker compose run --rm app npm run mail:test -- --send
 */
import nodemailer from "nodemailer";

const host = process.env.SMTP_HOST?.trim();
const from = process.env.SMTP_FROM?.trim();
const port = Number(process.env.SMTP_PORT || "587");
const secure = process.env.SMTP_SECURE === "true";
const user = process.env.SMTP_USER?.trim() || undefined;
const password = process.env.SMTP_PASSWORD || undefined;
const provider = (process.env.MAIL_PROVIDER || "").trim().toLowerCase();

const args = process.argv.slice(2);
const sendIndex = args.indexOf("--send");
const send = sendIndex !== -1;
const explicitRecipient = send && args[sendIndex + 1] && !args[sendIndex + 1].startsWith("--") ? args[sendIndex + 1] : undefined;
const recipient = explicitRecipient ?? user;

if (!host || !from) {
  console.error("SMTP_HOST and SMTP_FROM are required (see the email block of .env.local).");
  process.exit(1);
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`SMTP_PORT "${process.env.SMTP_PORT}" is not a valid port.`);
  process.exit(1);
}
if (send && !recipient) {
  console.error("--send needs a recipient address when SMTP_USER is empty.");
  process.exit(1);
}
const signIn = Boolean(user && password);
if (user && !password) console.warn("SMTP_PASSWORD is empty, so only the connection is checked. Gmail needs an App Password here (Google Account → Security → 2-Step Verification → App passwords).");
if (provider && provider !== "smtp") console.warn(`MAIL_PROVIDER=${provider}: the app will not send through SMTP until this is "smtp" (the check below still connects).`);

console.log(`Connecting to ${host}:${port} (${secure ? "implicit TLS" : "STARTTLS"})${signIn ? ` as ${user}` : ""}…`);
const transport = nodemailer.createTransport({ host, port, secure, auth: signIn ? { user, pass: password } : undefined });

try {
  await transport.verify();
  if (user && !password) {
    console.log("Connected: the server and TLS are fine. Fill in SMTP_PASSWORD and run again to test the sign-in.");
    process.exitCode = 1;
  } else if (!send) {
    console.log(signIn ? "Connected and signed in." : "Connected (no authentication configured).");
  } else {
    const info = await transport.sendMail({
      from,
      to: recipient,
      subject: "LeadTrailPro SMTP test",
      text: `This message was sent by scripts/mail-test.mjs at ${new Date().toISOString()} to confirm the SMTP settings in .env.local.`,
    });
    console.log(`Test email sent to ${recipient} (${info.response}).`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed: ${message}`);
  if (/535|invalid login|not accepted/i.test(message)) console.error("The server rejected the sign-in. For Gmail, use an App Password (needs 2-Step Verification) and the full address as SMTP_USER.");
  else if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|ECONNRESET/.test(message)) console.error("The SMTP host or port is unreachable: check SMTP_HOST, SMTP_PORT, SMTP_SECURE, and the network.");
  process.exitCode = 1;
} finally {
  transport.close();
}
