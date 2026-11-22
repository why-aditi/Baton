import { describe, expect, it } from 'vitest';
import { fromEntity, toEntity } from '../src/forge/kvsStore';
import { makeHandover } from './helpers';

describe('KVS entity mapping', () => {
  it('drops empty strings, which KVS rejects, and restores inputHash on read', () => {
    const draft = makeHandover({ inputHash: '' });
    const stored = toEntity(draft);
    expect(Object.values(stored)).not.toContain('');
    expect('inputHash' in stored).toBe(false);
    expect(fromEntity(stored)).toEqual(draft);
  });

  it('keeps non-empty values untouched', () => {
    const h = makeHandover({ inputHash: 'abc' });
    expect(fromEntity(toEntity(h))).toEqual(h);
  });
});
