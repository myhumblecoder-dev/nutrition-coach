'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface TrainingCardProps {
  training: {
    resistance: number
    hiit: number
    core: number
    stepsToday: number
    days: {
      resistance: boolean[]
      hiit: boolean[]
      core: boolean[]
    }
  }
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function DotRow({
  label,
  days,
  count,
  cadence,
  todayIndex,
}: {
  label: string
  days: boolean[]
  count: number
  cadence: string
  todayIndex: number
}) {
  return (
    <div className="grid grid-cols-[110px_repeat(7,minmax(0,1fr))_90px] items-center gap-2 text-[12.5px]">
      <div className="font-medium text-[#52525b]">{label}</div>
      {days.map((filled, i) => (
        <div
          key={i}
          data-filled={filled ? 'true' : 'false'}
          className="h-[22px] w-[22px] justify-self-center rounded-full"
          style={
            filled
              ? { background: '#059669' }
              : i === todayIndex
                ? { border: '2px dashed #d4d4d8' }
                : { background: '#e4e4e7' }
          }
        />
      ))}
      <div className="text-right text-[#71717a]">
        <span className="font-semibold text-[#18181b]">{count}</span> / {cadence}
      </div>
    </div>
  )
}

export default function TrainingCard({ training }: TrainingCardProps) {
  const { resistance, hiit, core, stepsToday, days } = training
  // Monday-first index of the current weekday.
  const todayIndex = (new Date().getDay() + 6) % 7
  const stepsPct = Math.min(100, (stepsToday / 10000) * 100)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Physical readiness</CardTitle>
        <span className="text-xs text-[#a1a1aa]">this week</span>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <DotRow label="Resistance" days={days.resistance} count={resistance} cadence="3–5" todayIndex={todayIndex} />
          <DotRow label="HIIT" days={days.hiit} count={hiit} cadence="2" todayIndex={todayIndex} />
          <DotRow label="Core" days={days.core} count={core} cadence="3" todayIndex={todayIndex} />
          <div className="grid grid-cols-[110px_repeat(7,minmax(0,1fr))_90px] gap-2 text-[10.5px] text-[#a1a1aa]">
            <div />
            {WEEKDAYS.map((d, i) => (
              <div key={i} className="text-center">
                {d}
              </div>
            ))}
            <div />
          </div>
        </div>
        <div className="space-y-2 border-t border-[#f0f0f1] pt-4">
          <div className="flex justify-between text-[12.5px]">
            <div className="font-medium text-[#52525b]">Steps today</div>
            <div className="text-[#71717a]">
              <span className="font-semibold text-[#18181b]">{stepsToday.toLocaleString()}</span> / 10,000
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#f0f0f1]">
            <div className="h-2 rounded-full bg-[#059669]" style={{ width: `${stepsPct}%` }} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
