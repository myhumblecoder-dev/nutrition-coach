'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteMealEntry } from '@/app/actions/deleteMealEntry'

interface DeleteMealButtonProps {
  mealId: string
}

export default function DeleteMealButton({ mealId }: DeleteMealButtonProps) {
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  const handleDelete = async () => {
    setBusy(true)
    try {
      await deleteMealEntry(mealId)
      // Server-rendered dashboard: re-fetch rather than patching client-side.
      router.refresh()
    } catch (err) {
      console.error(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      aria-label="Delete meal"
      disabled={busy}
      onClick={handleDelete}
      className="ml-2 text-sm text-zinc-400 hover:text-red-500 disabled:opacity-50"
    >
      ✕
    </button>
  )
}
