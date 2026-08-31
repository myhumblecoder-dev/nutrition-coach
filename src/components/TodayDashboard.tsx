'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

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
            <div className="space-y-2">
              <div className="text-2xl font-bold">
                {consumed.calories} / {target.calories} cal
              </div>
              <div className="text-sm text-muted-foreground">
                {consumed.protein} / {target.protein} g protein
              </div>
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
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">{mealLabel(meal.foodItems)}</span>
                    <span className="text-xs text-muted-foreground">
                      {meal.totalCalories} cal • {meal.totalProtein}g protein
                    </span>
                  </div>
                  <Badge variant="secondary">
                    {meal.totalCalories} cal
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}