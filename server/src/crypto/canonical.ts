/**
 * Canonical JSON Serialization (RFC 8785 style)
 * Deterministic JSON representation for cryptographic hashing and signing.
 * - Keys recursively sorted in lexicographical UTF-16 code unit order
 * - No redundant whitespace
 * - Standard JSON encoding for primitives
 */

export function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    const items = obj.map((item) => canonicalJson(item));
    return `[${items.join(',')}]`;
  }

  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map((key) => {
    const val = (obj as Record<string, unknown>)[key];
    return `${JSON.stringify(key)}:${canonicalJson(val)}`;
  });

  return `{${pairs.join(',')}}`;
}

export function canonicalBuffer(obj: unknown): Buffer {
  return Buffer.from(canonicalJson(obj), 'utf8');
}
