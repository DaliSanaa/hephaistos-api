import { calculateBreakdown } from './pricing';

describe('calculateBreakdown', () => {
  it('adds buyer premium and VAT for private B2C', () => {
    const b = calculateBreakdown(100_000, 'PRIVATE');
    expect(b.hammerPrice).toBe(100_000);
    expect(b.buyerPremium).toBe(5_000);
    expect(b.vatAmount).toBeGreaterThan(0);
    expect(b.totalAmount).toBe(b.hammerPrice + b.buyerPremium + b.vatAmount);
  });

  it('B2B has no VAT on subtotal', () => {
    const b = calculateBreakdown(100_000, 'BUSINESS');
    expect(b.vatAmount).toBe(0);
    expect(b.totalAmount).toBe(105_000);
  });
});
