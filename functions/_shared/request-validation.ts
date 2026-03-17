import { HttpError } from './http';

type RecordValue = Record<string, unknown>;

const createValidationError = (message: string) => new HttpError(400, message);

export const expectObject = (value: unknown, label = 'payload'): RecordValue => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw createValidationError(`${label} は object である必要があります。`);
  }
  return value as RecordValue;
};

export const expectOptionalObject = (value: unknown, label = 'payload'): RecordValue | undefined => {
  if (value === undefined) return undefined;
  return expectObject(value, label);
};

export const expectEmptyPayload = (value: unknown): undefined => {
  if (value === undefined) return undefined;
  const payload = expectObject(value);
  if (Object.keys(payload).length > 0) {
    throw createValidationError('この操作は payload を受け取りません。');
  }
  return undefined;
};

export const expectString = (record: RecordValue, key: string, label = key): string => {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw createValidationError(`${label} は必須の文字列です。`);
  }
  return value;
};

export const expectTrimmedString = (record: RecordValue, key: string, label = key): string => {
  const value = expectString(record, key, label).trim();
  if (!value) {
    throw createValidationError(`${label} は必須の文字列です。`);
  }
  return value;
};

export const expectOptionalString = (record: RecordValue, key: string): string | undefined => {
  const value = record[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw createValidationError(`${key} は文字列である必要があります。`);
  }
  return value;
};

export const expectNullableString = (record: RecordValue, key: string): string | null => {
  const value = record[key];
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') {
    throw createValidationError(`${key} は文字列または null である必要があります。`);
  }
  return value;
};

export const expectNumber = (record: RecordValue, key: string, label = key): number => {
  const value = record[key];
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw createValidationError(`${label} は数値である必要があります。`);
  }
  return value;
};

export const expectOptionalNumber = (record: RecordValue, key: string): number | undefined => {
  const value = record[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw createValidationError(`${key} は数値である必要があります。`);
  }
  return value;
};

export const expectBoolean = (record: RecordValue, key: string): boolean => {
  const value = record[key];
  if (typeof value !== 'boolean') {
    throw createValidationError(`${key} は boolean である必要があります。`);
  }
  return value;
};

export const expectStringArray = (record: RecordValue, key: string): string[] => {
  const value = record[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw createValidationError(`${key} は文字列配列である必要があります。`);
  }
  return value;
};

export const expectEnum = <TValue extends string>(
  value: unknown,
  allowedValues: readonly TValue[],
  label: string,
): TValue => {
  if (typeof value !== 'string' || !allowedValues.includes(value as TValue)) {
    throw createValidationError(`${label} が不正です。`);
  }
  return value as TValue;
};

export const expectOptionalEnum = <TValue extends string>(
  value: unknown,
  allowedValues: readonly TValue[],
  label: string,
): TValue | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  return expectEnum(value, allowedValues, label);
};
