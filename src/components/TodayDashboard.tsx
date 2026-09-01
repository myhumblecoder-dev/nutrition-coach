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
            <div className="flex items-center justify-around">
              <RingGauge
                value={consumed.calories}
                max={target.calories}
                centerText={String(consumed.calories)}
                subText={`of ${target.calories} kcal`}
                label="Calories"
              />
              <RingGauge
                value={consumed.protein}
                max={target.protein}
                centerText={`${consumed.protein}g`}
                subText={`of ${target.protein}g protein`}
                label="Protein"
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
                      <div className="h-11 w-11 flex-shrink-0 rounded-lg bg-[#f4f4f5]" />
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