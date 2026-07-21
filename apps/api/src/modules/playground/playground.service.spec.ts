import { diffValues } from './playground.service';

describe('diffValues', () => {
  it('reports unchanged for identical values', () => {
    expect(diffValues({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })).toEqual([
      { path: '$', type: 'unchanged' },
    ]);
  });

  it('reports added and removed keys', () => {
    const result = diffValues({ a: 1 }, { b: 2 });
    expect(result).toContainEqual({ path: '$.a', type: 'removed', before: 1 });
    expect(result).toContainEqual({ path: '$.b', type: 'added', after: 2 });
  });

  it('reports changed for a differing primitive', () => {
    expect(diffValues({ status: 'ok' }, { status: 'error' })).toEqual([
      { path: '$.status', type: 'changed', before: 'ok', after: 'error' },
    ]);
  });

  it('recurses into nested objects and arrays', () => {
    const before = { data: { items: [{ id: 1, name: 'a' }] } };
    const after = { data: { items: [{ id: 1, name: 'b' }, { id: 2, name: 'c' }] } };

    const result = diffValues(before, after);

    expect(result).toContainEqual({
      path: '$.data.items[0].name',
      type: 'changed',
      before: 'a',
      after: 'b',
    });
    expect(result).toContainEqual({
      path: '$.data.items[1]',
      type: 'added',
      after: { id: 2, name: 'c' },
    });
  });
});
