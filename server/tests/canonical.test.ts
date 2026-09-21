import { describe, it, expect } from 'vitest';
import { canonicalJson } from '../src/crypto/canonical';

describe('RFC 8785 Canonical JSON Serialization', () => {
  it('should be independent of object key order', () => {
    const obj1 = { z: 1, a: 2, m: 3 };
    const obj2 = { a: 2, m: 3, z: 1 };
    const obj3 = { m: 3, z: 1, a: 2 };

    const c1 = canonicalJson(obj1);
    const c2 = canonicalJson(obj2);
    const c3 = canonicalJson(obj3);

    expect(c1).toBe('{"a":2,"m":3,"z":1}');
    expect(c1).toBe(c2);
    expect(c2).toBe(c3);
  });

  it('should recursively sort nested object keys', () => {
    const nested1 = {
      user: { name: 'Alice', age: 22, address: { city: 'Chennai', pin: 600127 } },
      degree: 'B.Tech',
    };
    const nested2 = {
      degree: 'B.Tech',
      user: { address: { pin: 600127, city: 'Chennai' }, age: 22, name: 'Alice' },
    };

    expect(canonicalJson(nested1)).toBe(canonicalJson(nested2));
    expect(canonicalJson(nested1)).toBe(
      '{"degree":"B.Tech","user":{"address":{"city":"Chennai","pin":600127},"age":22,"name":"Alice"}}'
    );
  });

  it('should preserve array element order while canonically sorting nested items', () => {
    const arrObj = [
      { b: 2, a: 1 },
      { y: 4, x: 3 },
    ];
    expect(canonicalJson(arrObj)).toBe('[{"a":1,"b":2},{"x":3,"y":4}]');
  });

  it('should handle unicode strings, numbers, booleans, and null correctly', () => {
    const mixed = {
      unicode: 'Vellore Institute of Technology \u2714 \u00E9',
      count: 100,
      pi: 3.14159,
      active: true,
      revoked: false,
      empty: null,
    };
    const res = canonicalJson(mixed);
    expect(res).toContain('"active":true');
    expect(res).toContain('"empty":null');
    expect(res).toContain('"unicode":"Vellore Institute of Technology ✔ \u00e9"');
  });
});
