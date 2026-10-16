// JSON shapes for households and members, mirroring the ERD in
// docs/ARCHITECTURE.md §4. Field names must match the backend exactly;
// if Duy Anh finalises different names with the backend lead, update here.

/** A household. `id` is a PostgreSQL bigint, serialised as a JSON number. */
export interface Household {
  id: number
  /** 1–60 characters (US-01). */
  name: string
  /** ISO 8601 timestamp from `timestamptz`. */
  created_at: string
}

/** A member of a household. Names are unique inside one household (US-02). */
export interface Member {
  id: number
  household_id: number
  name: string
  /** ISO 8601 timestamp from `timestamptz`. */
  created_at: string
}
