// Small input validators. Each returns the cleaned value or throws a ValidationError
// with a message that is safe to show to the user.
import { ValidationError } from './errors.js';

export function num(value, name, { min = -Infinity, max = Infinity, integer = false } = {}) {
  const n = Number(value);
  if (value === '' || value === null || !Number.isFinite(n)) throw new ValidationError(`${name} must be a number`);
  if (integer && !Number.isInteger(n)) throw new ValidationError(`${name} must be a whole number`);
  if (n < min || n > max) throw new ValidationError(`${name} must be between ${min} and ${max}`);
  return n;
}

export function str(value, name, { required = false, max = 100_000 } = {}) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw new ValidationError(`${name} must be text`);
  if (required && !value.trim()) throw new ValidationError(`${name} is required`);
  if (value.length > max) throw new ValidationError(`${name} is too long (max ${max} characters)`);
  return value;
}

export function bool(value, name) {
  if (typeof value !== 'boolean') throw new ValidationError(`${name} must be true or false`);
  return value;
}

export function oneOf(value, name, allowed) {
  if (!allowed.includes(value)) throw new ValidationError(`${name} must be one of: ${allowed.join(', ')}`);
  return value;
}

// Copies only the keys present in `input` through their validators.
export function pick(input, validators) {
  const out = {};
  for (const [key, validate] of Object.entries(validators)) {
    if (input?.[key] !== undefined) out[key] = validate(input[key]);
  }
  return out;
}
