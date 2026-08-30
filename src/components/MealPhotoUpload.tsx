'use client'

import { useState } from 'react'
import { uploadMealPhoto } from '@/app/actions/uploadMealPhoto'
import { analyzeMeal } from '@/app/actions/analyzeMeal'

export interface MealAnalysis {
  photoUrl: string
  foodItems: Array<{ name: string; portion: string; calories: number; protein: number }>
  totalCalories: number
  totalProtein: number
}

interface MealPhotoUploadProps {
  onAnalyzed: (result: MealAnalysis) => void
}

export default function MealPhotoUpload({ onAnalyzed }: MealPhotoUploadProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setBusy(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const { url } = await uploadMealPhoto(formData)
      const analysis = await analyzeMeal(url)
      onAnalyzed({ ...analysis, photoUrl: url })
    } catch (err) {
      // The vision model can return unparseable output; surface it rather than
      // logging a half-analysed meal.
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full">
      <label
        htmlFor="meal-photo"
        className="block text-sm font-medium text-zinc-700 dark:text-zinc-200"
      >
        Photograph a meal
      </label>
      <input
        id="meal-photo"
        type="file"
        accept="image/*"
        // On a phone this opens the camera rather than the photo library.
        capture="environment"
        disabled={busy}
        onChange={handleChange}
        className="mt-2 block w-full text-sm file:mr-4 file:rounded-full file:border-0 file:bg-emerald-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-emerald-500 disabled:opacity-50"
      />
      {busy && <p className="mt-2 text-sm text-zinc-500">Analyzing…</p>}
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  )
}
