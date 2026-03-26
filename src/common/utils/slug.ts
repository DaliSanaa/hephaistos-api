import { nanoid } from 'nanoid';
import slugify from 'slugify';

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
  const suffix = nanoid(6);
  return `${base}-${suffix}`;
}

export function generateListingRef(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const code = nanoid(6).toUpperCase();
  return `HPH-${date}-${code}`;
}
