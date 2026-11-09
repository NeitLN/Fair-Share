/**
 * The VietQR account-transfer payload (specs/016-vietqr, "The code"), as NAPAS "QR Format T&C" v1.0
 * (September 2021) defines it: EMV tags of two characters, a two-digit length, then the value. Built in
 * the browser from what the API returned (bank BIN, account number, amount, the server's message); no
 * other service is involved. The holder's name is never in the code (no tag 59): the payer's banking app
 * shows the bank's own record of it.
 */

export interface VietqrInput {
  /** The bank's six-digit BIN. */
  bin: string
  /** Digits only, leading zeros kept. */
  account: string
  /** Whole đồng; left out for a reusable code without an amount. */
  amount?: number
  /** At most 24 ASCII characters, already cleaned by the server. */
  message: string
}

function tlv(tag: string, value: string): string {
  return `${tag}${String(value.length).padStart(2, '0')}${value}`
}

/** CRC-16/CCITT-FALSE (polynomial 0x1021, initial 0xFFFF), four upper-case hexadecimal digits. */
export function crc16(text: string): string {
  let crc = 0xffff
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

export function vietqrPayload({ bin, account, amount, message }: VietqrInput): string {
  const beneficiary = tlv('00', bin) + tlv('01', account)
  const merchant = tlv('00', 'A000000727') + tlv('01', beneficiary) + tlv('02', 'QRIBFTTA')
  // 12: a transaction-specific code with an amount; 11: a reusable one without (Fair-Share's choice)
  let body = tlv('00', '01') + tlv('01', amount === undefined ? '11' : '12') + tlv('38', merchant) + tlv('53', '704')
  if (amount !== undefined) body += tlv('54', String(amount))
  body += tlv('58', 'VN') + tlv('62', tlv('08', message)) + '6304'
  return body + crc16(body)
}
