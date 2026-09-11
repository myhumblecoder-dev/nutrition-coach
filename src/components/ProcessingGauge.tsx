'use client'

import React from 'react'
import { FAT_WHOLE, FAT_REFINED } from '@/lib/fatColour'

interface ProcessingGaugeProps {
  /** 0 entirely ultra-processed, 1 entirely whole. Null when unknown. */
  naturalShare: number | null
  label: string | null
}

/**
 * Where the day's eating sat between packaged food and real food.
 *
 * A bar rather than a ring, and deliberately so: rings on this screen are
 * progress towards a target, and this has none. There is nothing to reach —
 * it is a position, and a "get to 80% natural" goal would read as failure for
 * a day of unavoidable travel food.
 *
 * No percentage anywhere. A marker on a labelled spectrum is something you
 * glance at; a number invites arithmetic, and turns the gauge into a score out
 * of a hundred.
 *
 * Ends share the fat ring's two colours so the two features speak one visual
 * language — yellow is refined or packaged, green is whole or real, wherever
 * it appears.
 */
export default function ProcessingGauge({ naturalShare, label }: ProcessingGaugeProps) {
  // Nothing logged, or nothing classified: say so rather than parking the
  // marker at one end, which would be a claim about the day that is not true.
  if (naturalShare === null) {
    return (
      <div className="space-y-2">
        <div className="flex justify-between text-[12.5px]">
          <span className="font-medium text-[#52525b]">Processed</span>
          <span className="text-[#a1a1aa]">nothing logged yet</span>
          <span className="font-medium text-[#52525b]">Natural</span>
        </div>
        <div className="h-2 rounded-full bg-[#f0f0f1]" />
      </div>
    )
  }

  const position = Math.min(100, Math.max(0, naturalShare * 100))

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-[12.5px]">
        <span className="font-medium text-[#52525b]">Processed</span>
        <span data-testid="processing-label" className="text-[#18181b]">
          {label}
        </span>
        <span className="font-medium text-[#52525b]">Natural</span>
      </div>
      <div className="relative h-2">
        <div
          className="h-2 rounded-full"
          style={{ background: `linear-gradient(to right, ${FAT_REFINED}, ${FAT_WHOLE})` }}
        />
        {/* Ringed in white so it stays visible anywhere along the gradient. */}
        <div
          data-testid="processing-marker"
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#18181b] shadow"
          style={{ left: `${position}%` }}
        />
      </div>
    </div>
  )
}
