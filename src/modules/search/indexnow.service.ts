import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const LOCALES = ['en', 'de', 'fr', 'nl', 'pl', 'es'];

@Injectable()
export class IndexNowService {
  private readonly logger = new Logger(IndexNowService.name);
  private readonly key: string;
  private readonly host: string;

  constructor(private readonly config: ConfigService) {
    this.key = this.config.get<string>('INDEXNOW_KEY') ?? '';
    const base =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    try {
      this.host = new URL(base).host;
    } catch {
      this.host = 'localhost';
    }
  }

  /** Fire-and-forget — never throws to callers. */
  submitLotUrls(slug: string): void {
    if (!this.key) return;
    const base = (
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'
    ).replace(/\/$/, '');
    const urls = LOCALES.map((l) => `${base}/${l}/lot/${slug}`);
    void this.submitUrls(urls);
  }

  private async submitUrls(urls: string[]): Promise<void> {
    if (!this.key || urls.length === 0) return;
    try {
      const res = await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: this.host,
          key: this.key,
          keyLocation: `https://${this.host}/${this.key}.txt`,
          urlList: urls,
        }),
      });
      if (!res.ok) {
        this.logger.warn(`IndexNow HTTP ${res.status}`);
      }
    } catch (err) {
      this.logger.warn(
        `IndexNow submission failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
