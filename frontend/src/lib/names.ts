import type { Member } from '../api/types'
import { messages } from '../i18n'

/** How one member is shown (docs/DESIGN.md §3, §5, §6.4). */
export interface MemberLook {
  /** The name as entered: shown on Thành viên and as the avatar's accessible name. */
  full: string
  /** What the app calls them everywhere else: the last word, longer only when it clashes. */
  short: string
  /** The avatar letter: the first letter of the last word (the given name, not the family name). */
  initial: string
  /** Avatar tint 1–8 (--tint-1 … --tint-8). */
  tint: number
}

export const TINTS = 8

const words = (name: string) => name.trim().split(/\s+/).filter(Boolean)

// "Anh" and "anh" are the same person to a reader
const key = (text: string) => text.normalize('NFC').toLocaleLowerCase('vi')

/**
 * Students call each other by the given name, the last word: "Nguyễn Duy Anh" → "Anh". When two
 * members share it, both get their last two words ("Duy Anh", "Tuấn Anh"); if those still match, the
 * full name.
 */
export function shortNames(members: Member[]): Map<number, string> {
  const pick = (member: Member, count: number) => words(member.name).slice(-count).join(' ') || member.name

  const result = new Map<number, string>()
  const byLast = groupBy(members, (m) => key(pick(m, 1)))
  for (const group of byLast.values()) {
    if (group.length === 1) {
      result.set(group[0].id, pick(group[0], 1))
      continue
    }
    const byTwo = groupBy(group, (m) => key(pick(m, 2)))
    for (const pair of byTwo.values()) {
      for (const member of pair) {
        result.set(member.id, pair.length === 1 ? pick(member, 2) : member.name.trim())
      }
    }
  }
  return result
}

/** "Nguyễn Duy Anh" → "A", "Đức" → "Đ". */
export function initialOf(name: string): string {
  const last = words(name).at(-1) ?? name
  const first = Array.from(last.normalize('NFC'))[0] ?? '?'
  return first.toLocaleUpperCase('vi')
}

/**
 * A tint that stays put (DESIGN.md §3): members in id order; each prefers `id mod 8` and takes the
 * next free tint when an earlier member has it. Adding someone never recolours anyone; a house of up
 * to 8 never repeats a colour. Beyond 8 everyone keeps their preferred tint.
 */
export function tints(members: Member[]): Map<number, number> {
  const result = new Map<number, number>()
  const taken = new Set<number>()
  for (const member of [...members].sort((a, b) => a.id - b.id)) {
    const preferred = ((member.id % TINTS) + TINTS) % TINTS
    let slot = preferred
    if (taken.size < TINTS) {
      while (taken.has(slot)) slot = (slot + 1) % TINTS
    }
    taken.add(slot)
    result.set(member.id, slot + 1)
  }
  return result
}

/** Everything needed to show the members of one household, keyed by member id. */
export function memberLooks(members: Member[]): Map<number, MemberLook> {
  const shorts = shortNames(members)
  const colours = tints(members)
  return new Map(
    members.map((m) => [
      m.id,
      {
        full: m.name.trim(),
        short: shorts.get(m.id) ?? m.name,
        initial: initialOf(m.name),
        tint: colours.get(m.id) ?? 1,
      },
    ]),
  )
}

/** For someone no longer in the household (an old expense or settlement). */
export const REMOVED_MEMBER: MemberLook = {
  get full() {
    return messages().common.removedMember
  },
  get short() {
    return messages().common.removedMember
  },
  initial: '?',
  tint: 1,
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const k = keyOf(item)
    groups.set(k, [...(groups.get(k) ?? []), item])
  }
  return groups
}
