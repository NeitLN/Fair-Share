import { describe, expect, test } from 'vitest'

import { crc16, vietqrPayload } from './vietqr'

// Known answers (specs/016-vietqr, SC-003): assembled by hand from NAPAS "QR Format T&C" v1.0 (2021) and
// checksummed by a separate implementation, not by the module under test
const FIXTURES = {
  withAmount: {
    input: { bin: '970436', account: '0123456789', amount: 120_000, message: 'FS NHATROQ7 LAN' },
    payload:
      '00020101021238540010A00000072701240006970436011001234567890208QRIBFTTA530370454061200005802VN62190815FS NHATROQ7 LAN6304D2EF',
  },
  withoutAmount: {
    input: { bin: '970436', account: '0123456789', message: 'FS NHATROQ7 LAN' },
    payload:
      '00020101021138540010A00000072701240006970436011001234567890208QRIBFTTA53037045802VN62190815FS NHATROQ7 LAN630428F0',
  },
  leadingZeros: {
    input: { bin: '970415', account: '0001234567890123456', amount: 50_000, message: 'FS NHA LAN' },
    payload:
      '00020101021238630010A00000072701330006970415011900012345678901234560208QRIBFTTA53037045405500005802VN62140810FS NHA LAN6304D08F',
  },
  longestMessage: {
    input: { bin: '970422', account: '1234567890', amount: 1, message: 'FS NHATROQUAN7D NGUYENVA' },
    payload:
      '00020101021238540010A00000072701240006970422011012345678900208QRIBFTTA5303704540115802VN62280824FS NHATROQUAN7D NGUYENVA63049BE7',
  },
}

/** A TLV reader written only for these tests: tag (2), length (2 decimal digits), value. */
function readTlv(text: string): Map<string, string> {
  const fields = new Map<string, string>()
  let at = 0
  while (at < text.length) {
    const tag = text.slice(at, at + 2)
    const length = Number(text.slice(at + 2, at + 4))
    fields.set(tag, text.slice(at + 4, at + 4 + length))
    at += 4 + length
  }
  return fields
}

describe('the VietQR payload', () => {
  test('CRC-16/CCITT-FALSE gives the standard check value', () => {
    expect(crc16('123456789')).toBe('29B1')
  })

  test.each(Object.entries(FIXTURES))('%s matches the hand-made payload', (_name, { input, payload }) => {
    expect(vietqrPayload(input)).toBe(payload)
  })

  test.each(Object.entries(FIXTURES))('%s reads back field by field', (_name, { input, payload }) => {
    const top = readTlv(payload)
    expect(top.get('00')).toBe('01')
    expect(top.get('01')).toBe('amount' in input ? '12' : '11')
    const merchant = readTlv(top.get('38') as string)
    expect(merchant.get('00')).toBe('A000000727')
    expect(merchant.get('02')).toBe('QRIBFTTA')
    const beneficiary = readTlv(merchant.get('01') as string)
    expect(beneficiary.get('00')).toBe(input.bin)
    expect(beneficiary.get('01')).toBe(input.account)
    expect(top.get('53')).toBe('704')
    expect(top.get('58')).toBe('VN')
    expect(top.get('54')).toBe('amount' in input ? String(input.amount) : undefined)
    expect(readTlv(top.get('62') as string).get('08')).toBe(input.message)
    // The checksum covers everything up to and including "6304"
    expect(top.get('63')).toBe(crc16(payload.slice(0, -4)))
    expect(top.has('59')).toBe(false) // the holder's name is never in the code
  })
})
