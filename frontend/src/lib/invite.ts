/**
 * Invite codes and links (docs/ACCOUNTS.md). A code is 8 characters, shown as ABCD-EFGH so it can be
 * read out loud or typed from a chat; the link `/join/ABCDEFGH` fills it in. The API reads either form
 * (case, spaces and dashes do not matter).
 */

export const formatCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`

export const joinLink = (code: string) => `${window.location.origin}/join/${code}`

/**
 * The key of an invite link from before accounts (`/households/12#k=…`): it can still make its
 * holder the owner of a household nobody has taken over yet (L1).
 */
export function keyFromHash(hash: string): string | null {
  const key = new URLSearchParams(hash.replace(/^#/, '')).get('k')
  return key && /^[0-9a-f]{32,}$/i.test(key) ? key : null
}
