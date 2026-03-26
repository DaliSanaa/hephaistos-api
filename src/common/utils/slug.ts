import { randomBytes } from 'crypto';
import slugify from 'slugify';

function rid(len = 12): string {
  return randomBytes(len).toString('base64url').slice(0, len);
}

export function toSlug(text: string): string {
  return slugify(text, { lower: true, strict: true, trim: true });
}

export function generateLotSlug(
  brand: string,
  model: string,
  year: number,
): string {
  const base = slugify(`${brand} ${model} ${year}`, {
    lower: true,
    strict: true,
  });
  const suffix = rid(6);
  return `${base}-${suffix}`;
}

export function generateListingRef(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const code = rid(6).toUpperCase();
  return `HPH-${date}-${code}`;
}
