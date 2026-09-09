import { del } from '@vercel/blob'

/** Comfortably inside the store's per-call url limit. */
const BATCH_SIZE = 100

/**
 * Removes meal photos from blob storage.
 *
 * Nothing deleted blobs before this existed. Discarding a pending meal, or
 * deleting a logged one, dropped the row and left the photo; deleting an
 * account cascaded every table and left every one of that user's photos live
 * at a public URL, permanently. That is a privacy problem before it is a cost
 * one — "delete my account" has to mean it.
 *
 * It is also the only cost that grows with total signups rather than with
 * subscribers, and the only one that never resets.
 *
 * Never throws. A failed cleanup leaves an orphaned blob, which costs money;
 * a thrown one would fail the deletion the user actually asked for, which
 * costs trust.
 */
export async function deletePhotos(
  urls: readonly (string | null | undefined)[]
): Promise<void> {
  // Chat-extracted meals carry an empty photoUrl rather than null, and the
  // blob store rejects the whole batch if any entry is not a url.
  const real = urls.filter((url): url is string => Boolean(url))
  if (real.length === 0) return

  // Chunked, because a long-standing account can have thousands of photos and
  // `del` caps how many urls it takes. One oversized call would throw, get
  // swallowed below, and leave EVERY photo public — the exact outcome this
  // function exists to prevent, arriving silently.
  //
  // Each chunk is caught on its own so one bad batch cannot abandon the rest.
  for (let i = 0; i < real.length; i += BATCH_SIZE) {
    const batch = real.slice(i, i + BATCH_SIZE)

    try {
      await del(batch)
    } catch (error) {
      console.error(
        `photo cleanup failed for ${batch.length} blobs: ` +
          (error instanceof Error ? error.message : 'unknown')
      )
    }
  }
}
