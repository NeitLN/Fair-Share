/**
 * A name as banking apps show it (specs/016-vietqr, FR-003): accents dropped, Đ/đ → D, capitals, only
 * A-Z, 0-9 and single spaces. The twin of the server's `clean_ascii` (app/services/vietqr.py), with the
 * same test cases (clean-ascii-cases.json); only the server's result is saved.
 */
export function cleanAscii(text: string): string {
  const letters = text
    .replace(/Đ/g, 'D')
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
  return letters
    .replace(/[^A-Z0-9 ]/g, '')
    .split(' ')
    .filter(Boolean)
    .join(' ')
}
