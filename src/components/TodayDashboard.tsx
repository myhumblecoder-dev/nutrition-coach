'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import RingGauge from '@/components/RingGauge'
import DeleteMealButton from '@/components/DeleteMealButton'

interface TodayDashboardProps {
  consumed: {
    calories: number
    protein: number
  }
  target: {
    calories: number
    protein: number
  } | null
  meals: Array<{
    id: string
    foodItems: string
    totalCalories: number
    totalProtein: number
    photoUrl?: string
    source?: string
  }>
}

// foodItems is stored as a JSON-encoded array of {name, portion, calories,
// protein}; anything unparseable falls back to a generic label.
function mealLabel(foodItems: string): string {
  try {
    const items = JSON.parse(foodItems)
    if (Array.isArray(items) && items.length > 0) {
      return items.map((item) => item.name).join(', ')
    }
  } catch {
    // fall through
  }
  return 'Meal'
}

export default function TodayDashboard({ consumed, target, meals }: TodayDashboardProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Daily Progress</CardTitle>
        </CardHeader>
        <CardContent>
          {target ? (
            <div className="flex flex-wrap items-center justify-center gap-x-16 gap-y-6 py-2">
              <RingGauge
                value={consumed.calories}
                max={target.calories}
                centerText={consumed.calories.toLocaleString()}
                subText={`of ${target.calories.toLocaleString()} kcal`}
                label="Calories"
                size={168}
              />
              <RingGauge
                value={consumed.protein}
                max={target.protein}
                centerText={`${consumed.protein}g`}
                subText={`of ${target.protein}g protein`}
                label="Protein"
                size={168}
              />
            </div>
          ) : (
            <p className="text-muted-foreground">Set your daily targets</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Today's Meals</CardTitle>
        </CardHeader>
        <CardContent>
          {meals.length === 0 ? (
            <p className="text-muted-foreground">No meals logged today</p>
          ) : (
            <div className="space-y-4">
              {meals.map((meal) => (
                <div
                  key={meal.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    {meal.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={meal.photoUrl}
                        alt=""
                        className="h-11 w-11 flex-shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      // A chat-logged meal has no photo; an empty grey square
                      // reads as a broken image rather than an absent one.
                      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-[#f4f4f5] text-[#a1a1aa]">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 2v7c0 1.1.9 2 2 2h1a2 2 0 0 0 2-2V2M6 2v20M18 2c-1.7 0-3 1.8-3 4v6h3v10" />
                        </svg>
                      </div>
                    )}
                    <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{mealLabel(meal.foodItems)}</span>
                      {meal.source === 'extracted' && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                          via chat
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {meal.totalCalories} cal • {meal.totalProtein}g protein
                    </span>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <Badge variant="secondary">
                      {meal.totalCalories} cal
                    </Badge>
                    <DeleteMealButton mealId={meal.id} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}