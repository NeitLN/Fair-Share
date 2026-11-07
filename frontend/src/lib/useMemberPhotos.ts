import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { householdPhotos, keys } from '../api/households'
import type { Member } from '../api/types'

/**
 * The photos of a household's people, by member id (specs/010-profile-page, research R2). One request
 * for the whole house, made only when someone has a photo, and again only when a photo or a person
 * changes: the members carry each photo's version, and the versions are part of the cache key. No
 * polling. Until it answers, or if it fails, there is no map and every avatar shows its initial.
 */
export function useMemberPhotos(householdId: number, members: Member[] | undefined) {
  const versions = (members ?? [])
    .filter((m) => m.photo_version)
    .map((m) => `${m.id}:${m.photo_version}`)
    .join(',')
  const photos = useQuery({
    queryKey: keys.photos(householdId, versions),
    queryFn: () => householdPhotos(householdId),
    enabled: versions !== '',
    staleTime: Infinity,
  })
  return useMemo(
    () => (photos.data ? new Map(photos.data.photos.map((p) => [p.member_id, p.data])) : undefined),
    [photos.data],
  )
}
