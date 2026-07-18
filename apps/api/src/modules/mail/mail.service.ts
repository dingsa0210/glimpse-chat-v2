import { Injectable, Logger } from "@nestjs/common";
import { resolveMx, resolveTxt } from "node:dns/promises";
import nodemailer from "nodemailer";
import { SystemConfigService } from "../system-config/system-config.service";

type SmtpConfig = { host: string; port: number; secure: boolean; user: string; pass: string; from: string };

export type MailDeliveryReceipt = {
  status: "submitted";
  messageId: string;
  response: string;
  recipientDomain: string;
  warnings: string[];
};

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char] ?? char));
}

function extractEmail(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

function emailDomain(value: string) {
  return extractEmail(value).split("@").at(-1) ?? "unknown";
}

function sanitizeSmtpResponse(value: unknown) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 500);
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  constructor(private readonly systemConfig: SystemConfigService) {}

  async verifyConnection() {
    const smtp = await this.smtpConfig();
    const startedAt = Date.now();
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user && smtp.pass ? { user: smtp.user, pass: smtp.pass } : undefined,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 20_000,
      tls: { servername: smtp.host }
    });
    try {
      await transporter.verify();
      return { elapsedMs: Date.now() - startedAt, detail: `SMTP connection accepted by ${smtp.host}:${smtp.port}.` };
    } finally {
      transporter.close();
    }
  }

  async sendVerificationCode(email: string, code: string) {
    const subject = `Verification Code: ${code} - Glimpse Chat`;
    const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172126"><h2>Glimpse Chat verification code</h2><p>Your verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px;color:#0f7f8c">${escapeHtml(code)}</p><p>This code is valid for 10 minutes. If you did not request it, ignore this email.</p></div>`;
    const text = `Glimpse Chat verification code: ${code}\n\nThis code is valid for 10 minutes. If you did not request it, ignore this email.`;
    return this.sendConfiguredMessage({ to: email, subject, html, text });
  }

  async sendSmtpTest(email: string, nickname?: string) {
    const greeting = nickname?.trim() ? `Hello ${escapeHtml(nickname.trim())},` : "Hello,";
    const subject = "Glimpse Chat SMTP test";
    const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172126"><h2>Glimpse Chat SMTP test</h2><p>${greeting}</p><p>This message confirms that the configured mail provider accepted the message for delivery. Provider acceptance is not the same as final inbox delivery.</p></div>`;
    const text = `Glimpse Chat SMTP test\n\n${nickname?.trim() ? `Hello ${nickname.trim()},\n\n` : ""}The configured mail provider accepted this message for delivery. Provider acceptance is not the same as final inbox delivery.`;
    return this.sendConfiguredMessage({ to: email, subject, html, text, verifyConnection: true });
  }

  async sendPasswordResetLink(email: string, link: string, nickname?: string) {
    const greeting = nickname?.trim() ? `Hello ${escapeHtml(nickname.trim())},` : "Hello,";
    const subject = "Reset your Glimpse Chat password";
    const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172126"><h2>Glimpse Chat password reset</h2><p>${greeting}</p><p>Use the link below to set a new password. This link is valid for 30 minutes and can be used once.</p><p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#0f7f8c;color:#fff;text-decoration:none">Reset password</a></p><p style="word-break:break-all;color:#52636a">${escapeHtml(link)}</p><p>If you did not request this, ignore this email.</p></div>`;
    const text = `Glimpse Chat password reset\n\nUse this link within 30 minutes to set a new password:\n${link}\n\nIf you did not request this, ignore this email.`;
    return this.sendConfiguredMessage({ to: email, subject, html, text });
  }

  private async sendConfiguredMessage({ to, subject, html, text, verifyConnection = false }: { to: string; subject: string; html: string; text: string; verifyConnection?: boolean }): Promise<MailDeliveryReceipt> {
    const smtp = await this.smtpConfig();
    const recipient = extractEmail(to);
    const sender = extractEmail(smtp.from);
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user && smtp.pass ? { user: smtp.user, pass: smtp.pass } : undefined,
      connectionTimeout: 20_000,
      greetingTimeout: 20_000,
      socketTimeout: 30_000,
      name: emailDomain(sender),
      tls: { servername: smtp.host }
    });

    try {
      if (verifyConnection) await transporter.verify();
      const info = await transporter.sendMail({
        from: { name: "Glimpse Chat", address: sender },
        envelope: { from: sender, to: [recipient] },
        to: recipient,
        subject,
        text,
        html
      });
      const accepted = (info.accepted ?? []).map(String).some((value) => extractEmail(value) === recipient);
      const rejected = (info.rejected ?? []).map(String).some((value) => extractEmail(value) === recipient);
      const response = sanitizeSmtpResponse(info.response);
      if (!accepted || rejected) throw new Error(`SMTP provider rejected the recipient${response ? `: ${response}` : "."}`);
      const warnings = await this.deliveryWarnings(smtp);
      this.logger.log(`Email submitted to SMTP; recipientDomain=${emailDomain(recipient)} messageId=${info.messageId || "unknown"} response=${response || "accepted"}`);
      return { status: "submitted", messageId: String(info.messageId ?? ""), response, recipientDomain: emailDomain(recipient), warnings };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Email submission failed; recipientDomain=${emailDomain(recipient)} reason=${reason}`);
      throw error;
    } finally {
      transporter.close();
    }
  }

  private async deliveryWarnings(config: SmtpConfig) {
    const senderDomain = emailDomain(config.from);
    const warnings: string[] = [];
    const isTencentSes = /qcloudmail\.com$/i.test(config.host);
    if (!isTencentSes) return warnings;

    const [mxResult, senderTxtResult, dmarcResult] = await Promise.allSettled([
      resolveMx(senderDomain),
      resolveTxt(senderDomain),
      resolveTxt(`_dmarc.${senderDomain}`)
    ]);
    if (mxResult.status === "fulfilled") {
      // mxbiz1.qq.com is the MX value required by Tencent SES domain
      // verification. It must not be treated as evidence that this subdomain
      // is also an enterprise-mailbox domain.
      const hasTencentSesMx = mxResult.value.some((item) => /(^|\.)mxbiz1\.qq\.com$/i.test(item.exchange));
      if (!hasTencentSesMx) warnings.push(`Tencent SES MX verification record is missing for ${senderDomain}.`);
    } else {
      warnings.push(`Could not verify MX records for ${senderDomain}: ${mxResult.reason instanceof Error ? mxResult.reason.message : String(mxResult.reason)}`);
    }
    if (senderTxtResult.status === "fulfilled") {
      const records = senderTxtResult.value.map((parts) => parts.join(""));
      const hasTencentSpf = records.some((value) => /^v=spf1\b/i.test(value) && /include:qcloudmail\.com/i.test(value));
      if (!hasTencentSpf) warnings.push(`Tencent SES SPF verification record is missing for ${senderDomain}.`);
    } else {
      warnings.push(`Could not verify SPF records for ${senderDomain}: ${senderTxtResult.reason instanceof Error ? senderTxtResult.reason.message : String(senderTxtResult.reason)}`);
    }
    if (dmarcResult.status === "fulfilled") {
      const hasDmarc = dmarcResult.value.map((parts) => parts.join("")).some((value) => /^v=DMARC1\b/i.test(value));
      if (!hasDmarc) warnings.push(`DMARC record is missing for ${senderDomain}.`);
    } else {
      warnings.push(`Could not verify DMARC records for ${senderDomain}: ${dmarcResult.reason instanceof Error ? dmarcResult.reason.message : String(dmarcResult.reason)}`);
    }
    return warnings;
  }

  private async smtpConfig(): Promise<SmtpConfig> {
    const read = (key: string, fallback = "") => this.systemConfig.get(key, fallback);
    const host = (await read("SMTP_HOST")).trim();
    if (!host) throw new Error("SMTP is not configured: SMTP_HOST is empty.");
    const secureValue = (await read("SMTP_SECURE", "false")).trim().toLowerCase();
    const secure = ["true", "1", "yes"].includes(secureValue);
    const configuredPort = Number((await read("SMTP_PORT", "")).trim());
    const port = Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : secure ? 465 : 587;
    const user = (await read("SMTP_USER")).trim();
    const primaryPass = await read("SMTP_PASS");
    const legacyPass = await read("SMTP_PASSWORD");
    const pass = primaryPass || legacyPass;
    if (Boolean(user) !== Boolean(pass)) throw new Error("SMTP configuration is incomplete: SMTP_USER and SMTP_PASS must be provided together.");
    const from = (await read("SMTP_FROM")).trim() || user || "noreply@glimpse.local";
    return { host, port, secure, user, pass, from };
  }
}
