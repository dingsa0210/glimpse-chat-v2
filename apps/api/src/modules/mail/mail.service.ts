import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

@Injectable()
export class MailService {
  private readonly transporter: Transporter;
  private readonly logger = new Logger(MailService.name);
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>("SMTP_HOST", "smtp.exmail.qq.com");
    const port = this.config.get<number>("SMTP_PORT", 465);
    const secure = this.config.get<string>("SMTP_SECURE", "true") === "true";
    const user = this.config.get<string>("SMTP_USER", "");
    const pass = this.config.get<string>("SMTP_PASS", this.config.get<string>("SMTP_PASSWORD", ""));

    this.from = this.config.get<string>("SMTP_FROM", user || "noreply@verify.glimpsetech.cn");

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined
    });

    this.logger.log(`Mail transport configured: ${host}:${port} (secure=${secure})`);
  }

  async sendMail(options: { to: string; subject: string; html: string }): Promise<void> {
    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to: options.to,
        subject: options.subject,
        html: options.html
      });
      this.logger.log(`Mail sent to ${options.to}: ${info.messageId}`);
    } catch (error) {
      this.logger.error(`Failed to send mail to ${options.to}`, error instanceof Error ? error.message : error);
      throw error;
    }
  }

  async sendVerificationCode(email: string, code: string): Promise<void> {
    const html = `
      <div style="max-width:480px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1e293b;">
        <h2 style="margin:0 0 16px;font-size:22px;color:#0f766e;">Glimpse Chat</h2>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#475569;">
          Your email verification code is:
        </p>
        <div style="background:#f0fdfa;border:1px solid #ccfbf1;border-radius:8px;padding:20px 24px;text-align:center;margin-bottom:24px;">
          <span style="font-size:32px;font-weight:700;letter-spacing:6px;color:#0f766e;font-family:monospace;">${code}</span>
        </div>
        <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;">
          This code will expire in 10 minutes. If you did not request this, please ignore this email.
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
        <p style="margin:0;font-size:12px;color:#94a3b8;">
          Glimpse Chat — noreply@verify.glimpsetech.cn
        </p>
      </div>`;
    await this.sendMail({
      to: email,
      subject: `Verification Code: ${code} — Glimpse Chat`,
      html
    });
  }
}
