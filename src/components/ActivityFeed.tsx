'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface ActivityItem {
  id: string
  at: Date | string
  sourceText: string | null
  source: string
  kind: string
  label: string
  photoUrl: string | null
}

interface ActivityFeedProps {
  items: Array<ActivityItem>
}

export default function ActivityFeed({ items }: ActivityFeedProps) {
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Tell the coach about your day — meals, training, sleep — and it lands here.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-medium text-foreground">
        From your conversation
      </h2>
      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="bg-white border-[#e4e4e7] border rounded-[12px] p-3 space-y-2"
          >
            {item.sourceText && (
              <p className="text-muted-foreground italic text-sm">
                "{item.sourceText}"
              </p>
            )}
            {item.photoUrl && (
              <img
                src={item.photoUrl}
                alt="Activity"
                className="w-10 h-10 rounded-md object-cover"
              />
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-[#047857]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span className="text-sm font-bold text-foreground">
                  Logged: {item.label}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(item.at).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
