import { generateLotSlug, toSlug } from './slug';

jest.mock('nanoid', () => ({
  nanoid: () => 'abc123',
}));

describe('slug', () => {
  it('slugifies text', () => {
    expect(toSlug('Hello World!')).toBe('hello-world');
  });

  it('generateLotSlug includes suffix', () => {
    const s = generateLotSlug('John Deere', '6R', 2021);
    expect(s).toBe('john-deere-6r-2021-abc123');
  });
});
