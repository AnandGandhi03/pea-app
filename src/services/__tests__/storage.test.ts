import { migrate, SCHEMA_VERSION } from '../storage';

describe('migrate', () => {
  it('returns null for non-object input', () => {
    expect(migrate(null)).toBeNull();
    expect(migrate(undefined)).toBeNull();
    expect(migrate('nope')).toBeNull();
  });

  it('recovers createdAt from a legacy 13-digit Date.now() id', () => {
    const legacyId = '1699999999999';
    const result = migrate({
      userName: 'Anand',
      briefTime: '7:00 AM',
      items: { buy: [{ id: legacyId, text: 'Milk', done: false, time: '2m' }], do: [], call: [], follow: [] },
    });
    expect(result?.items.buy[0].createdAt).toBe(Number(legacyId));
    expect(result?.items.buy[0].draft).toBeNull();
    expect(result?.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('preserves an existing createdAt when present', () => {
    const result = migrate({
      userName: 'Anand',
      briefTime: '7:00 AM',
      items: { buy: [], do: [{ id: 'abc-123', text: 'Do thing', done: true, createdAt: 42 }], call: [], follow: [] },
    });
    expect(result?.items.do[0].createdAt).toBe(42);
    expect(result?.items.do[0].done).toBe(true);
  });

  it('drops malformed items that lack an id or text', () => {
    const result = migrate({
      userName: 'A',
      briefTime: '7:00 AM',
      items: { buy: [{ id: 'ok', text: 'Keep' }, { text: 'no id' }, { id: 'no-text' }], do: [], call: [], follow: [] },
    });
    expect(result?.items.buy).toHaveLength(1);
    expect(result?.items.buy[0].text).toBe('Keep');
  });

  it('tolerates missing categories and non-array items', () => {
    const result = migrate({ userName: 'A', briefTime: '7:00 AM', items: { buy: 'broken' } });
    expect(result?.items).toEqual({ buy: [], do: [], call: [], follow: [] });
  });

  it('defaults missing scalar fields safely', () => {
    const result = migrate({ items: { buy: [], do: [], call: [], follow: [] } });
    expect(result?.userName).toBe('');
    expect(result?.briefTime).toBe('');
    expect(result?.captureCount).toBe(0);
    expect(typeof result?.lastCountReset).toBe('string');
  });
});
