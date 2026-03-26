const BID_INCREMENT_TABLE = [
  { upTo: 50000, increment: 1000 },
  { upTo: 100000, increment: 2500 },
  { upTo: 500000, increment: 5000 },
  { upTo: 1000000, increment: 10000 },
  { upTo: 2500000, increment: 25000 },
  { upTo: 5000000, increment: 50000 },
  { upTo: 10000000, increment: 100000 },
  { upTo: Number.POSITIVE_INFINITY, increment: 250000 },
] as const;

/** `currentBidCents` — minimum next bid is current + increment (both in cents). */
export function getBidIncrement(currentBidCents: number): number {
  for (const row of BID_INCREMENT_TABLE) {
    if (currentBidCents < row.upTo) return row.increment;
  }
  return BID_INCREMENT_TABLE[BID_INCREMENT_TABLE.length - 1].increment;
}
