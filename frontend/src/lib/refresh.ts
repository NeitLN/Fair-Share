/**
 * How often what changes because of a housemate (a request to join, a "Tôi đã chuyển", the balances it
 * settles) is asked again while the page is open. TanStack Query never refetches on an interval in a
 * background tab, so a phone in a pocket sends nothing (PROJECT_SPEC §3.3, approved on 04/11).
 */
export const REFRESH_MS = 30_000
