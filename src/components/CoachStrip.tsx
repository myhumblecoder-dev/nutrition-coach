'use client'

import Link from 'next/link'

interface CoachStripProps {
  message: string | null
}

export default function CoachStrip({ message }: CoachStripProps) {
  if (!message) {
    return null
  }

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-[14px] border border-[#a7f3d0] bg-[#ecfdf5]"
    >
      <div className="flex-shrink-0 w-[36px] h-[36px] rounded-md bg-[#059669] flex items-center justify-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="white"
          className="w-5 h-5"
        >
          <path
            fillRule="evenodd"
            d="M4.848 4.999a.75.75 0 01.63.114l11.5 6.333a.75.75 0 010 1.266l-11.5 6.333a.75.75 0 01-.88.114l-4.5-3.75a.75.75 0 01-.38-.66v-7.32a.75.75 0 01.38-.66l4.5-3.75z"
            clipRule="evenodd"
          />
          <path
            d="M18.75 6.75a.75.75 0 01.75.75v8.25a.75.75 0 01-.75.75h-15a.75.75 0 01-.75-.75v-8.25a.75.75 0 01.75-.75h15z"
          />
        </svg>
      </div>

      <p className="flex-1 text-[#065f46] text-sm font-medium line-clamp-2">
        {message}
      </p>

      <Link
        href="/chat"
        className="text-sm font-bold text-[#059669] hover:underline whitespace-nowrap"
      >
        Open chat
      </Link>
    </div>
  )
}
