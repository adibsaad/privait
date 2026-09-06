import { useEffect, useRef } from 'react'

import { useQuery } from '@apollo/client/react'
import { toast } from 'sonner'

import { MemoriesDocument } from '@frontend/graphql/output/graphql'

/**
 * Surfaces distilled memories without opening Settings: polls the memories
 * list and toasts newly distilled entries. Polling (not push) is fine for a
 * local app — the distillation writes behind the Apollo cache's back, so
 * this reads network-only. The first poll seeds the known set; pre-existing
 * memories never toast.
 */
export function MemoriesWatcher() {
  const { data } = useQuery(MemoriesDocument, {
    fetchPolicy: 'network-only',
    pollInterval: 20_000,
  })
  const knownIdsRef = useRef<Set<string> | null>(null)

  useEffect(() => {
    ;((window as unknown as { __watchLog?: unknown[] }).__watchLog ??= []).push(
      {
        t: Date.now(),
        n: data?.memories?.length ?? -1,
      },
    )
    const memories = data?.memories ?? []
    const current = new Set(memories.map(m => m.id))
    if (knownIdsRef.current !== null) {
      memories.forEach(memory => {
        if (
          memory.source === 'DISTILLED' &&
          !knownIdsRef.current?.has(memory.id)
        ) {
          toast(`Memory saved: ${memory.content}`)
        }
      })
    }
    knownIdsRef.current = current
  }, [data])

  return null
}
