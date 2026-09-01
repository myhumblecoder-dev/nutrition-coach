import Link from 'next/link';
import { appTimeZone } from '@/lib/time';

export default function NavBar() {
  const dateStr = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: appTimeZone(),
  }).format(new Date());

  return (
    <nav className="flex h-16 items-center justify-between border-b border-[#e4e4e7] bg-white px-10">
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2">
          <div className="flex h-[26px] w-[26px] items-center justify-center rounded-8px bg-[#059669]">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path
                d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                fill="white"
              />
            </svg>
          </div>
          <span className="font-[600]">Nutrition Coach</span>
        </div>
        <div className="flex gap-6 text-sm">
          <Link href="/">Today</Link>
          <Link href="/targets">Targets</Link>
          <Link href="/chat">Chat</Link>
        </div>
      </div>
      <div className="text-[13px] text-muted-foreground">
        {dateStr}
      </div>
    </nav>
  );
}