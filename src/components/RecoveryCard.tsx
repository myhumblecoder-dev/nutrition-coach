'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  recovery: {
    sleepHours: number | null
    waterLiters: number | null
    alcoholDrinks: number | null
  }
  mood: { score: number; note: string | null } | null
  measurement: { weightLb: number | null; waistIn: number | null } | null
  weights: Array<{ at: Date | string; weightLb: number }>
}

function Bar({ pct, band }: { pct: number; band?: { left: number; width: number } }) {
  return (
    <div className="relative h-2 rounded-full bg-[#f0f0f1]">
      {band && (
        <div
          className="absolute h-2 rounded-full bg-[#d1fae5]"
          style={{ left: `${band.left}%`, width: `${band.width}%` }}
        />
      )}
      <div
        className="absolute left-0 h-2 rounded-full bg-[#059669]"
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  )
}

function Sparkline({ weights }: { weights: Array<{ at: Date | string; weightLb: number }> }) {
  const w = 380
  const h = 44
  const values = weights.map((p) => p.weightLb)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const points = weights
    .map((p, i) => {
      const x = (i / (weights.length - 1)) * w
      const y = 6 + (1 - (p.weightLb - min) / span) * (h - 12)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const [lastX, lastY] = points.split(' ').at(-1)!.split(',')
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke="#059669"
        strokeWidth="2"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lastX} cy={lastY} r="4" fill="#059669" stroke="#ffffff" strokeWidth="2" />
    </svg>
  )
}

export default function RecoveryCard({ recovery, mood, measurement, weights }: Props) {
  const { sleepHours, waterLiters, alcoholDrinks } = recovery
  const rowLabel = 'text-[12.5px] font-medium text-[#52525b]'
  const rowValue = 'text-[12.5px] text-[#71717a]'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recovery &amp; mind</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {sleepHours != null ? (
          <div className="space-y-2">
            <div className="flex justify-between">
              <div className={rowLabel}>Sleep</div>
              <div className={rowValue}>
                <span className="font-semibold text-[#18181b]">{sleepHours}h</span> · target 7–9h
              </div>
            </div>
            {/* 7–9h zone of a 0–12h scale */}
            <Bar pct={(sleepHours / 12) * 100} band={{ left: 58, width: 17 }} />
          </div>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">Sleep: not logged</p>
        )}

        {waterLiters != null ? (
          <div className="space-y-2">
            <div className="flex justify-between">
              <div className={rowLabel}>Water</div>
              <div className={rowValue}>
                <span className="font-semibold text-[#18181b]">{waterLiters}L</span> / 3.8L
              </div>
            </div>
            <Bar pct={(waterLiters / 3.8) * 100} />
          </div>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">Water: not logged</p>
        )}

        <div className="flex items-center justify-between">
          <div className={rowLabel}>Alcohol</div>
          {alcoholDrinks == null || alcoholDrinks === 0 ? (
            <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#047857]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              {alcoholDrinks === 0 ? 'none today' : 'none logged'}
            </div>
          ) : (
            <div className={rowValue}>{alcoholDrinks} drinks</div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[#f0f0f1] pt-3">
          <div className={rowLabel}>Mood</div>
          {mood ? (
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-3 w-3 rounded-full"
                  style={{ background: i <= mood.score ? '#059669' : '#e4e4e7' }}
                />
              ))}
              <span className="ml-1 text-xs text-[#71717a]">
                {mood.score}/5{mood.note ? ` · ${mood.note}` : ''}
              </span>
            </div>
          ) : (
            <div className={rowValue}>not logged</div>
          )}
        </div>

        <div className="space-y-1.5 border-t border-[#f0f0f1] pt-3">
          {measurement && (measurement.weightLb != null || measurement.waistIn != null) ? (
            <>
              <div className="flex items-baseline justify-between">
                <div className={rowLabel}>Weight</div>
                <div>
                  {measurement.weightLb != null && (
                    <>
                      <span className="text-lg font-bold">{measurement.weightLb}</span>{' '}
                      <span className="text-xs text-[#71717a]">lb · goal 160 lb</span>
                    </>
                  )}
                  {measurement.weightLb == null && measurement.waistIn != null && (
                    <span className="text-xs text-[#71717a]">{measurement.waistIn} in waist</span>
                  )}
                </div>
              </div>
              {weights.length >= 2 && <Sparkline weights={weights} />}
            </>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">Measurement: not logged</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
