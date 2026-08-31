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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleSave = async () => {
    setError(null)
    setSaved(false)
    setSaving(true)
    try {
      await upsertDailyTarget({ calories, protein })
      setSaved(true)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save targets')
    } finally {
      setSaving(false)
    }
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
      <Button onClick={handleSave} disabled={saving || calories <= 0 || protein <= 0}>
        Save targets
      </Button>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {saved && <p className="text-sm text-green-600">Targets saved</p>}
    </div>
  )
}
