/**
 * A draft's identity (specs/020-no-double-save): a version-4 UUID sent with every press of one thing
 * the person means to record once. Pressing again with it gets the record it already made back.
 *
 * `crypto.randomUUID()` exists only on HTTPS and localhost; a phone on the local network opens the
 * app over plain HTTP, where `crypto.getRandomValues()` still works.
 */
export function newDraftId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // RFC 4122 variant
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
