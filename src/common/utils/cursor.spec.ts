import { decodeCursor, encodeCursor } from './cursor';

describe('cursor', () => {
  it('round-trips', () => {
    const c = encodeCursor('abc', 'x');
    expect(decodeCursor(c)).toEqual({ id: 'abc', sv: 'x' });
  });
});
