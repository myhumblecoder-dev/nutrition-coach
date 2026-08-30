'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import MealPhotoUpload, { type MealAnalysis } from '@/components/MealPhotoUpload'
import MealConfirmCard from '@/components/MealConfirmCard'
import TodayDashboard from '@/components/TodayDashboard'

interface HomeClientProps {
  today: {
    meals: Array<{
      id: string
      foodItems: string
      totalCalories: number
      totalProtein: number
    }>
    target: { calories: number; protein: number } | null
    consumed: { calories: number; protein: number }
  }
}

export default function HomeClient({ today }: HomeClientProps) {
  const router = useRouter()
  const [pending, setPending] = useState<MealAnalysis | null>(null)

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 p-6">
      <MealPhotoUpload onAnalyzed={setPending} />

      {pending && (
        <MealConfirmCard
          analysis={pending}
          onSaved={() => {
            setPending(null)
            // The dashboard is server-rendered, so re-fetch rather than
            // patching the totals client-side and risking a drift.
            router.refresh()
          }}
          onCancel={() => setPending(null)}
        />
      )}

      <TodayDashboard
        consumed={today.consumed}
        target={today.target}
        meals={today.meals}
      />
    </div>
  )
}
