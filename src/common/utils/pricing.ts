const BUYER_PREMIUM_PERCENT = 5;
const DEFAULT_VAT_PERCENT = 21;

export interface PriceBreakdown {
  hammerPrice: number;
  buyerPremium: number;
  vatAmount: number;
  totalAmount: number;
}

export function calculateBreakdown(
  hammerPriceCents: number,
  userType: 'BUSINESS' | 'PRIVATE',
): PriceBreakdown {
  const buyerPremium = Math.round(
    (hammerPriceCents * BUYER_PREMIUM_PERCENT) / 100,
  );
  const subtotal = hammerPriceCents + buyerPremium;
  const vatAmount =
    userType === 'PRIVATE'
      ? Math.round((subtotal * DEFAULT_VAT_PERCENT) / 100)
      : 0;
  return {
    hammerPrice: hammerPriceCents,
    buyerPremium,
    vatAmount,
    totalAmount: subtotal + vatAmount,
  };
}
