'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import MealPhotoUpload, { type MealAnalysis } from '@/components/MealPhotoUpload'
import MealConfirmCard from '@/components/MealConfirmCard'
import TodayDashboard from '@/components/TodayDashboard'
import TrainingCard from '@/components/TrainingCard'
import RecoveryCard from '@/components/RecoveryCard'

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
  week: {
    training: { resistance: number; hiit: number; core: number; stepsToday: number }
    recovery: { sleepHours: number | null; waterLiters: number | null; alcoholDrinks: number | null }
    mood: { score: number; note: string | null } | null
    measurement: { weightLb: number | null; waistIn: number | null } | null
  }
}

export default function HomeClient({ today, week }: HomeClientProps) {
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

      <TrainingCard training={week.training} />
      <RecoveryCard recovery={week.recovery} mood={week.mood} measurement={week.measurement} />

      <TodayDashboard
        consumed={today.consumed}
        target={today.target}
        meals={today.meals}
      />
    </div>
  )
}
