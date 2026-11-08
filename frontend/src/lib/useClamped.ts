import { useLayoutEffect, useRef, useState } from 'react'

/**
 * Which descriptions the two-line clamp is cutting (spec 012, US5). Measured after layout from the
 * element itself, so it is the real width and text that decide; `ref` is a callback per expense id
 * to put on the text inside the clamp.
 */
export function useClampedDescriptions(expenses: { id: number; description: string }[]) {
  const nodes = useRef(new Map<number, HTMLElement>())
  const [clamped, setClamped] = useState<ReadonlySet<number>>(new Set())

  useLayoutEffect(() => {
    const next = new Set<number>()
    for (const [id, node] of nodes.current) {
      if (node.scrollHeight > node.clientHeight) next.add(id)
    }
    // Same answer: keep the old set, so the extra render does not start another round
    setClamped((current) =>
      current.size === next.size && [...next].every((id) => current.has(id)) ? current : next,
    )
  }, [expenses])

  const ref = (id: number) => (node: HTMLElement | null) => {
    if (node) nodes.current.set(id, node)
    else nodes.current.delete(id)
  }

  return { clamped, ref }
}
