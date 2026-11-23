import {
  describe,
  expect,
  it
} from 'vitest';

import { toPropertyValue } from './property-values.ts';

describe('toPropertyValue', () => {
  it('writes one value as a string and several as a list', () => {
    expect(toPropertyValue(['[[a]]'])).toBe('[[a]]');
    expect(toPropertyValue(['[[a]]', '[[b]]'])).toEqual(['[[a]]', '[[b]]']);
    expect(toPropertyValue([])).toEqual([]);
  });
});
