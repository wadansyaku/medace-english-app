export {
  expectBoolean,
  expectEmptyPayload,
  expectEnum,
  expectNumber,
  expectObject,
  expectOptionalEnum,
  expectOptionalNumber,
  expectOptionalObject,
  expectOptionalString,
  expectString,
  expectStringArray,
  expectTrimmedString,
} from './request-validation';

import { HttpError } from './http';
import { expectNumber, expectOptionalString } from './request-validation';

type RecordValue = Record<string, unknown>;

const createValidationError = (message: string) => new HttpError(400, message);

export const expectIntegerInRange = (
  record: RecordValue,
  key: string,
  options: {
    label?: string;
    min?: number;
    max?: number;
    optional?: boolean;
  } = {},
): number | undefined => {
  const { label = key, min, max, optional = false } = options;
  const value = optional ? expectNumberLikeOptional(record, key, label) : expectNumber(record, key, label);
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isInteger(value)) {
    throw createValidationError(`${label} は整数である必要があります。`);
  }
  if (min !== undefined && value < min) {
    throw createValidationError(`${label} は ${min} 以上である必要があります。`);
  }
  if (max !== undefined && value > max) {
    throw createValidationError(`${label} は ${max} 以下である必要があります。`);
  }
  return value;
};

const expectNumberLikeOptional = (
  record: RecordValue,
  key: string,
  label: string,
): number | undefined => {
  const value = record[key];
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw createValidationError(`${label} は数値である必要があります。`);
  }
  return value;
};

export const expectOptionalTrimmedString = (
  record: RecordValue,
  key: string,
  label = key,
): string | undefined => {
  const value = expectOptionalString(record, key);
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw createValidationError(`${label} は空白のみを指定できません。`);
  }
  return trimmed;
};

export const expectOptionalSha256Base64 = (
  record: RecordValue,
  key: string,
  label = key,
): string | undefined => {
  const value = expectOptionalTrimmedString(record, key, label);
  if (value === undefined) {
    return undefined;
  }
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    throw createValidationError(`${label} は SHA-256 の base64 文字列である必要があります。`);
  }
  return value;
};
