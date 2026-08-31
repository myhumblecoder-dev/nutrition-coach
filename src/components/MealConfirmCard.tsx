'use client'

import { useState } from 'react'
import { saveMealEntry } from '@/app/actions/saveMealEntry'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

interface FoodItem {
  name: string
  portion: string
  calories: number
  protein: number
}

interface MealAnalysis {
  photoUrl: string
  foodItems: FoodItem[]
  totalCalories: number
  totalProtein: number
}

interface MealConfirmCardProps {
  analysis: MealAnalysis
  onSaved: () => void
  onCancel: () => void
}

export default function MealConfirmCard({
  analysis,
  onSaved,
  onCancel,
}: MealConfirmCardProps) {
  const [calories, setCalories] = useState<number>(analysis.totalCalories)
  const [protein, setProtein] = useState<number>(analysis.totalProtein)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogMeal = async () => {
    setIsSaving(true)
    setError(null)
    try {
      await saveMealEntry({
        photoUrl: analysis.photoUrl,
        foodItems: analysis.foodItems,
        totalCalories: calories,
        totalProtein: protein,
      })
      onSaved()
    } catch (err) {
      // Surface the failure inline; a browser alert blocks the page.
      setError(err instanceof Error ? err.message : 'Failed to save meal')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Confirm Meal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Detected Items:</p>
          <div className="space-y-2">
            {analysis.foodItems.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center text-sm">
                <span>{item.name}</span>
                <Badge variant="secondary">
                  {item.portion}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t">
          <div className="space-y-2">
            <Label htmlFor="calories-input">Total Calories</Label>
            <Input
              id="calories-input"
              type="number"
              value={calories}
              onChange={(e) => setCalories(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="protein-input">Total Protein (g)</Label>
            <Input
              id="protein-input"
              type="number"
              value={protein}
              onChange={(e) => setProtein(Number(e.target.value))}
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
      </CardContent>
      <CardFooter className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button
          className="flex-1"
          onClick={handleLogMeal}
          disabled={isSaving}
        >
          {isSaving ? 'Saving...' : 'Log meal'}
        </Button>
      </CardFooter>
    </Card>
  )
}
