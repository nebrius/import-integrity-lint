import { getSubpathEntry } from '../getSubpathEntry.js';

it('Returns the entry whose key is the longest directory prefix of the file', () => {
  const data = new Map([
    ['/repo', 'repo'],
    ['/repo/packages/a', 'a'],
    ['/repo/packages/a/nested', 'nested'],
  ]);
  expect(getSubpathEntry({ filePath: '/repo/packages/a/src/x.ts', data })).toBe(
    'a'
  );
  expect(
    getSubpathEntry({ filePath: '/repo/packages/a/nested/y.ts', data })
  ).toBe('nested');
  expect(getSubpathEntry({ filePath: '/repo/other/z.ts', data })).toBe('repo');
});

it('Longest prefix wins regardless of map insertion order', () => {
  const shortFirst = new Map([
    ['/repo', 'repo'],
    ['/repo/packages/a', 'a'],
  ]);
  const longFirst = new Map([
    ['/repo/packages/a', 'a'],
    ['/repo', 'repo'],
  ]);
  const filePath = '/repo/packages/a/x.ts';
  expect(getSubpathEntry({ filePath, data: shortFirst })).toBe('a');
  expect(getSubpathEntry({ filePath, data: longFirst })).toBe('a');
});

it('Returns the entry for an exact key match', () => {
  const data = new Map([
    ['/repo', 'repo'],
    ['/repo/packages/a', 'a'],
  ]);
  expect(getSubpathEntry({ filePath: '/repo/packages/a', data })).toBe('a');
  expect(getSubpathEntry({ filePath: '/repo', data })).toBe('repo');
});

it('Returns undefined when no key is a prefix of the file', () => {
  const data = new Map([['/repo/packages/a', 'a']]);
  expect(
    getSubpathEntry({ filePath: '/elsewhere/x.ts', data })
  ).toBeUndefined();
  expect(
    getSubpathEntry({ filePath: '/repo/packages/x.ts', data })
  ).toBeUndefined();
  expect(getSubpathEntry({ filePath: '/repo/packages', data })).toBeUndefined();
});

it('Matches whole path segments, not string prefixes', () => {
  const data = new Map([['/repo/packages/a', 'a']]);
  expect(
    getSubpathEntry({ filePath: '/repo/packages/ab/x.ts', data })
  ).toBeUndefined();
});

it('Matches Windows-style keys against Windows-style files', () => {
  const data = new Map([
    ['C:\\repo', 'repo'],
    ['C:\\repo\\packages\\a', 'a'],
  ]);
  expect(
    getSubpathEntry({ filePath: 'C:\\repo\\packages\\a\\x.ts', data })
  ).toBe('a');
  expect(
    getSubpathEntry({ filePath: 'C:\\repo\\packages\\ab\\x.ts', data })
  ).toBe('repo');
});

it('Returns identical results across repeated lookups against the same map', () => {
  const data = new Map([
    ['/repo', 'repo'],
    ['/repo/packages/a', 'a'],
  ]);
  for (let i = 0; i < 3; i++) {
    expect(getSubpathEntry({ filePath: '/repo/packages/a/x.ts', data })).toBe(
      'a'
    );
    expect(getSubpathEntry({ filePath: '/repo/y.ts', data })).toBe('repo');
    expect(
      getSubpathEntry({ filePath: '/elsewhere/z.ts', data })
    ).toBeUndefined();
  }
});
