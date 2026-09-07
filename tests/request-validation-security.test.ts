import { describe, expect, it } from 'vitest';

import {
  expectNumber,
  expectOptionalNumber,
} from '../functions/_shared/request-validation';
import { expectIntegerInRange } from '../functions/_shared/validators';

describe('numeric request validation security boundaries', () => {
  it.each([
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])('rejects non-finite required numbers: %s', (value) => {
    expect(() => expectNumber({ value }, 'value')).toThrow('value は数値である必要があります。');
  });

  it.each([
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])('rejects non-finite optional numbers: %s', (value) => {
    expect(() => expectOptionalNumber({ value }, 'value')).toThrow('value は数値である必要があります。');
  });

  it('rejects non-finite values before integer range checks', () => {
    expect(() => expectIntegerInRange(
      { value: Number.POSITIVE_INFINITY },
      'value',
      { optional: true, min: 1, max: 400 },
    )).toThrow('value は数値である必要があります。');
  });
});
