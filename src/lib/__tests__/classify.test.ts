import { localClassify, classifyWithFallback } from '../classify';

describe('localClassify', () => {
  it('routes call verbs to the call category', () => {
    expect(localClassify('call the dentist')).toEqual({ category: 'call', cleaned: 'Call the dentist' });
    expect(localClassify('text mom back')?.category).toBe('call');
    expect(localClassify('message the school')?.category).toBe('call');
  });

  it('routes follow-up phrases to the follow category', () => {
    expect(localClassify('follow up with the plumber')?.category).toBe('follow');
    expect(localClassify('check on the insurance claim')?.category).toBe('follow');
    expect(localClassify('waiting for the contractor')?.category).toBe('follow');
  });

  it('routes grocery words to the buy category and prefixes Buy when no verb is present', () => {
    expect(localClassify('milk')).toEqual({ category: 'buy', cleaned: 'Buy Milk' });
    expect(localClassify('bananas and eggs')?.category).toBe('buy');
  });

  it('keeps an explicit buy verb without double-prefixing', () => {
    const r = localClassify('grab some oat milk');
    expect(r?.category).toBe('buy');
    expect(r?.cleaned.startsWith('Buy Buy')).toBe(false);
  });

  it('handles plural grocery words via singularization', () => {
    expect(localClassify('apples')?.category).toBe('buy');
  });

  it('returns null for ambiguous text so the remote classifier can decide', () => {
    expect(localClassify('plan the weekend trip')).toBeNull();
    expect(localClassify('finish the presentation')).toBeNull();
  });

  it('prioritizes call patterns over grocery words', () => {
    // "call" starter wins even though the sentence mentions a grocery item
    expect(localClassify('call about the milk delivery')?.category).toBe('call');
  });
});

describe('classifyWithFallback', () => {
  it('falls back to the do category for ambiguous text', () => {
    expect(classifyWithFallback('plan the weekend trip')).toEqual({
      category: 'do',
      cleaned: 'Plan the weekend trip',
    });
  });

  it('uses the local classification when one exists', () => {
    expect(classifyWithFallback('call grandma')).toEqual({ category: 'call', cleaned: 'Call grandma' });
  });
});
