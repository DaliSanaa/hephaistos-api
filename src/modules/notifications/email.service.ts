import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: {
    emails: { send: (args: Record<string, unknown>) => Promise<unknown> };
  } | null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (apiKey) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Resend } = require('resend') as {
        Resend: new (key: string) => {
          emails: { send: (args: Record<string, unknown>) => Promise<unknown> };
        };
      };
      this.resend = new Resend(apiKey);
    } else {
      this.resend = null;
    }
  }

  async send(params: {
    userId: string;
    template: string;
    data: Record<string, unknown>;
  }): Promise<void> {
    if (!this.resend) {
      this.logger.log(
        `[EmailService] Mock: would send "${params.template}" to user ${params.userId}`,
      );
      return;
    }

    const user = await this.prisma.user.findFirst({
      where: { id: params.userId, deletedAt: null },
    });
    if (!user) return;

    const { subject, html } = this.renderTemplate(params.template, params.data);
    const from =
      this.config.get<string>('RESEND_FROM_EMAIL') ??
      'Hephaistos <noreply@hephaistos.eu>';

    await this.resend.emails.send({
      from,
      to: user.email,
      subject,
      html,
    });
  }

  private renderTemplate(
    template: string,
    data: Record<string, unknown>,
  ): { subject: string; html: string } {
    const s = (v: unknown): string =>
      typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
        ? String(v)
        : '';

    const eur = (cents: unknown): string =>
      typeof cents === 'number' ? (cents / 100).toFixed(2) : s(cents);

    const templates: Record<
      string,
      (d: Record<string, unknown>) => { subject: string; html: string }
    > = {
      outbid: (d) => ({
        subject: `You've been outbid on ${s(d.lotTitle)}`,
        html: `<p>Someone placed a higher bid on <strong>${s(d.lotTitle)}</strong>. The current bid is now €${eur(d.currentBid)}.</p><p><a href="${s(d.lotUrl)}">Place a new bid</a></p>`,
      }),
      won: (d) => ({
        subject: `Congratulations! You won ${s(d.lotTitle)}`,
        html: `<p>You won the auction for <strong>${s(d.lotTitle)}</strong> with a final bid of €${eur(d.finalPrice)}.</p><p>Payment is due within 48 hours.</p><p><a href="${s(d.paymentUrl)}">Complete payment</a></p>`,
      }),
      payment_received: (d) => ({
        subject: `Payment received for ${s(d.lotTitle)}`,
        html: `<p>We've received your payment of €${eur(d.amount)} for <strong>${s(d.lotTitle)}</strong>.</p><p>The inspection window is open for 72 hours.</p>`,
      }),
      seller_lot_sold: (d) => ({
        subject: `Your lot sold: ${s(d.lotTitle)}`,
        html: `<p>Your listing <strong>${s(d.lotTitle)}</strong> has been sold for €${eur(d.finalPrice)}.</p><p>Funds will be released after the buyer confirms receipt.</p>`,
      }),
      seller_payout: (d) => ({
        subject: `Payout processed: €${eur(d.amount)}`,
        html: `<p>Your payout of €${eur(d.amount)} for <strong>${s(d.lotTitle)}</strong> has been initiated. It should arrive in 2-3 business days.</p>`,
      }),
      password_reset: (d) => ({
        subject: 'Password reset request',
        html: `<p>Click the link below to reset your password:</p><p><a href="${s(d.resetUrl)}">Reset password</a></p><p>This link expires in 1 hour.</p>`,
      }),
      lot_approved: (d) => ({
        subject: `Your listing is live: ${s(d.lotTitle)}`,
        html: `<p>Your listing <strong>${s(d.lotTitle)}</strong> has been approved and is now live on Hephaistos.</p><p><a href="${s(d.lotUrl)}">View listing</a></p>`,
      }),
      lot_rejected: (d) => ({
        subject: `Listing not approved: ${s(d.lotTitle)}`,
        html: `<p>Your listing <strong>${s(d.lotTitle)}</strong> was not approved.</p><p>Reason: ${s(d.reason)}</p><p>You can edit and resubmit your listing.</p>`,
      }),
      daily_digest: (d) => ({
        subject: 'New listings in categories you follow',
        html: `<p>Here are recent listings in categories you watch:</p><ul>${s(d.itemsHtml)}</ul><p><a href="${s(d.browseUrl)}">Browse all lots</a></p>`,
      }),
      generic: (d) => ({
        subject: s(d.title) || 'Notification',
        html: `<p>${s(d.body)}</p>`,
      }),
    };

    const tmpl = templates[template] ?? templates.generic;
    return tmpl(data);
  }
}
