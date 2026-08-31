'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface TrainingCardProps {
  training: {
    resistance: number
    hiit: number
    core: number
    stepsToday: number
  }
}

export default function TrainingCard({ training }: TrainingCardProps) {
  const { resistance, hiit, core, stepsToday } = training
  const rowClass = 'text-sm'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Physical Readiness</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className={rowClass}>
          {`Resistance: ${resistance} / 3\u20135 this week`}
        </div>
        <div className={rowClass}>
          {`HIIT: ${hiit} / 2 this week`}
        </div>
        <div className={rowClass}>
          {`Core: ${core} / 3 this week`}
        </div>
        <div className={rowClass}>
          {`Steps today: ${stepsToday.toLocaleString()} / 10,000`}
        </div>
      </CardContent>
    </Card>
  )
}