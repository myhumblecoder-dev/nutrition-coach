'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { upsertDailyTarget } from '@/app/actions/upsertDailyTarget'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

interface DailyTargetFormProps {
  initial: { calories: number; protein: number } | null
}

export default function DailyTargetForm({ initial }: DailyTargetFormProps) {
  const [calories, setCalories] = useState(initial?.calories ?? 0)
  const [protein, setProtein] = useState(initial?.protein ?? 0)
  const [saved, setSaved] = useState(false)
  const router = useRouter()

  const handleSave = async () => {
    await upsertDailyTarget({ calories, protein })
    router.refresh()
    setSaved(true)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="space-y-1">
          <Label htmlFor="calories">Daily calories</Label>
          <Input
            id="calories"
            type="number"
            value={calories}
            onChange={(e) => setCalories(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="protein">Daily protein (g)</Label>
          <Input
            id="protein"
            type="number"
            value={protein}
            onChange={(e) => setProtein(Number(e.target.value))}
          />
        </div>
      </div>
      <Button onClick={handleSave}>Save targets</Button>
      {saved && <p className="text-sm text-green-600">Targets saved</p>}
    </div>
  )
}
