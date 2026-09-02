'use client';

import React from 'react';

interface RingGaugeProps {
  value: number;
  max: number;
  centerText: string;
  subText: string;
  label: string;
  size?: number;
}

export default function RingGauge({
  value,
  max,
  centerText,
  subText,
  label,
  size = 148,
}: RingGaugeProps) {
  const radius = size * 0.424;
  const circumference = 2 * Math.PI * radius;
  const fraction = Math.min(1, max > 0 ? value / max : 0);
  const filled = fraction * circumference;
  const remaining = circumference - filled;
  const sw = size / 12;
  const mid = size / 2;

  return (
    <div className="flex flex-col items-center">
      {/* width/height are required: with only a viewBox the svg collapses to
          the default replaced-element size, and since every label is sized in
          viewBox units the numbers shrink with it until unreadable. */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="overflow-visible"
      >
        <circle
          cx={mid}
          cy={mid}
          r={radius}
          stroke="#f0f0f1"
          strokeWidth={sw}
          fill="none"
        />
        <circle
          data-testid="ring-gauge-progress"
          cx={mid}
          cy={mid}
          r={radius}
          stroke="#059669"
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${remaining}`}
          fill="none"
          transform={`rotate(-90 ${mid} ${mid})`}
        />
        {/* No rotation here: only the progress arc is rotated, to start at
            twelve o'clock. The matching rotate(90) this group used to carry
            stood the numbers on their side. */}
        <g>
          <text
            x={mid}
            y={mid - size * 0.04}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={size * 0.2}
            fontWeight="bold"
            fill="#18181b"
          >
            {centerText}
          </text>
          {/* Sized to keep the longest sub-label inside the ring's inner
              diameter now that it runs horizontally. */}
          <text
            x={mid}
            y={mid + size * 0.13}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={size * 0.09}
            fill="#71717a"
          >
            {subText}
          </text>
        </g>
      </svg>
      <div style={{ fontSize: '12.5px', color: '#52525b' }}>{label}</div>
    </div>
  );
}
