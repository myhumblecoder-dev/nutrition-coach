'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import MealPhotoUpload, { type MealAnalysis } from '@/components/MealPhotoUpload'
import MealConfirmCard from '@/components/MealConfirmCard'
import TodayDashboard from '@/components/TodayDashboard'
import TrainingCard from '@/components/TrainingCard'
import RecoveryCard from '@/components/RecoveryCard'
import RemainingCard from '@/components/RemainingCard'
import CoachStrip from '@/components/CoachStrip'
import ActivityFeed from '@/components/ActivityFeed'

interface HomeClientProps {
  today: {
    meals: Array<{
      id: string
      foodItems: string
      totalCalories: number
      totalProtein: number
      photoUrl?: string
      source?: string
    }>
    target: { calories: number; protein: number } | null
    consumed: { calories: number; protein: number }
  }
  week: {
    training: {
      resistance: number
      hiit: number
      core: number
      stepsToday: number
      days: { resistance: boolean[]; hiit: boolean[]; core: boolean[] }
    }
    recovery: { sleepHours: number | null; waterLiters: number | null; alcoholDrinks: number | null }
    mood: { score: number; note: string | null } | null
    measurement: { weightLb: number | null; waistIn: number | null } | null
    streak: boolean[]
    weights: Array<{ at: Date | string; weightLb: number }>
  }
  activity: Array<{
    id: string
    at: Date | string
    sourceText: string | null
    source: string
    kind: string
    label: string
    photoUrl: string | null
  }>
  coachMessage: string | null
}

export default function HomeClient({ today, week, activity, coachMessage }: HomeClientProps) {
  const router = useRouter()
  const [pending, setPending] = useState<MealAnalysis | null>(null)

  const proteinToGo = today.target
    ? Math.max(0, today.target.protein - today.consumed.protein)
    : null

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Today</h1>
          <p className="text-sm text-[#71717a]" suppressHydrationWarning>
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            })}
            {' · '}
            {today.consumed.calories} kcal in
            {proteinToGo != null ? `, ${proteinToGo}g protein to go` : ''}
          </p>
        </div>
        <MealPhotoUpload onAnalyzed={setPending} />
      </div>

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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <TodayDashboard
            consumed={today.consumed}
            target={today.target}
            meals={today.meals}
          />
        </div>
        <div className="lg:col-span-4">
          <RemainingCard
            remaining={today.target ? today.target.calories - today.consumed.calories : null}
            streak={week.streak}
          />
        </div>
        <div className="lg:col-span-7">
          <TrainingCard training={week.training} />
        </div>
        <div className="lg:col-span-5">
          <RecoveryCard
            recovery={week.recovery}
            mood={week.mood}
            measurement={week.measurement}
            weights={week.weights}
          />
        </div>
        <div className="lg:col-span-12">
          <CoachStrip message={coachMessage} />
        </div>
        <div className="lg:col-span-12">
          <ActivityFeed items={activity} />
        </div>
      </div>
    </div>
  )
}
