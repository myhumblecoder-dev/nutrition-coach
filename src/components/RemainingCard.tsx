'use client'

import { Card, CardContent } from '@/components/ui/card'

interface RemainingCardProps {
  remaining: number | null
  streak: boolean[]
}

export default function RemainingCard({ remaining, streak }: RemainingCardProps) {
  const logged = streak.filter(Boolean).length

  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col justify-between gap-6 pt-2">
        <div className="space-y-1">
          <div className="text-[13px] font-semibold text-[#52525b]">Remaining today</div>
          {remaining != null ? (
            <>
              <div className="text-[40px] font-bold tracking-tight">
                {remaining.toLocaleString()}{' '}
                <span className="text-base font-medium text-[#71717a]">kcal</span>
              </div>
              <div className="text-[12.5px] text-[#71717a]">Deficit window −300 to −500</div>
            </>
          ) : (
            <p className="text-muted-foreground">Set your daily targets</p>
          )}
        </div>
        {streak.length > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-[#71717a]">
              <span>Logging streak</span>
              <span className="font-semibold text-[#18181b]">
                {logged} of {streak.length} days
              </span>
            </div>
            <div className="flex gap-1">
              {streak.map((day, i) => (
                <div
                  key={i}
                  data-pip={day ? 'true' : 'false'}
                  className="h-1.5 flex-grow rounded-full"
                  style={{ background: day ? '#059669' : '#e4e4e7' }}
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
