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
    <div>
      <label
        htmlFor="meal-photo"
        className={`inline-flex cursor-pointer items-center gap-2.5 rounded-[10px] bg-[#059669] px-[18px] py-[11px] text-sm font-semibold text-white hover:bg-[#047857] ${busy ? 'opacity-60' : ''}`}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        {busy ? 'Analyzing…' : 'Log a meal'}
        <span className="sr-only">Photograph a meal</span>
      </label>
      <input
        id="meal-photo"
        type="file"
        accept="image/*"
        // On a phone this opens the camera rather than the photo library.
        capture="environment"
        disabled={busy}
        onChange={handleChange}
        className="sr-only"
      />
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  )
}
