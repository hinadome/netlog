const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export function isSafeRecordKey(key: string): boolean {
  return !UNSAFE_KEYS.has(key)
}

export function assignSafeScalar(
  target: Record<string, number | string>,
  key: string,
  value: unknown,
): void {
  if (!isSafeRecordKey(key)) return
  if (typeof value === 'number' || typeof value === 'string') {
    target[key] = value
  }
}

export function assignSafeString(target: Record<string, string>, key: string, value: string): void {
  if (!isSafeRecordKey(key)) return
  target[key.toLowerCase()] = value
}
