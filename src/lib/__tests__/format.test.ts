import { cap, relativeTime, newId } from '../format';

describe('cap', () => {
  it('capitalizes the first letter only', () => {
    expect(cap('hello world')).toBe('Hello world');
    expect(cap('a')).toBe('A');
    expect(cap('')).toBe('');
  });
});

describe('relativeTime', () => {
  const NOW = 1_700_000_000_000;
  beforeAll(() => { jest.spyOn(Date, 'now').mockReturnValue(NOW); });
  afterAll(() => { jest.restoreAllMocks(); });

  it('shows "Just now" for very recent times', () => {
    expect(relativeTime(NOW - 30_000)).toBe('Just now');
  });

  it('shows minutes under an hour', () => {
    expect(relativeTime(NOW - 5 * 60_000)).toBe('5m');
  });

  it('shows hours under a day', () => {
    expect(relativeTime(NOW - 3 * 3_600_000)).toBe('3h');
  });

  it('shows "Yesterday" for one day ago', () => {
    expect(relativeTime(NOW - 25 * 3_600_000)).toBe('Yesterday');
  });

  it('shows day counts under a week', () => {
    expect(relativeTime(NOW - 3 * 24 * 3_600_000)).toBe('3d');
  });
});

describe('newId', () => {
  it('produces unique ids across rapid calls', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId()));
    expect(ids.size).toBe(1000);
  });
});
