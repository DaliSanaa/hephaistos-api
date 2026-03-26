import { getBidIncrement } from './bid-increment';

describe('getBidIncrement', () => {
  it('covers every tier boundary', () => {
    expect(getBidIncrement(0)).toBe(1000);
    expect(getBidIncrement(49_999)).toBe(1000);
    expect(getBidIncrement(50_000)).toBe(2500);
    expect(getBidIncrement(99_999)).toBe(2500);
    expect(getBidIncrement(100_000)).toBe(5000);
    expect(getBidIncrement(499_999)).toBe(5000);
    expect(getBidIncrement(500_000)).toBe(10_000);
    expect(getBidIncrement(999_999)).toBe(10_000);
    expect(getBidIncrement(1_000_000)).toBe(25_000);
    expect(getBidIncrement(2_499_999)).toBe(25_000);
    expect(getBidIncrement(2_500_000)).toBe(50_000);
    expect(getBidIncrement(4_999_999)).toBe(50_000);
    expect(getBidIncrement(5_000_000)).toBe(100_000);
    expect(getBidIncrement(9_999_999)).toBe(100_000);
    expect(getBidIncrement(10_000_000)).toBe(250_000);
  });
});
