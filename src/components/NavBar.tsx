import Link from 'next/link';
import { auth, signOut } from '@/auth';

function TabIcon({ path }: { path: string }) {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}

const ICONS = {
  today: 'M3 12l9-9 9 9M5 10v10h14V10',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  signIn: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3',
  signOut: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
};

export default async function NavBar() {
  const session = await auth();

  const authButton = session?.user?.id ? (
    <form
      action={async () => {
        'use server';
        await signOut();
      }}
    >
      <button
        type="submit"
        aria-label="Sign out"
        className="flex h-9 w-9 items-center justify-center rounded-full text-[#71717a] hover:bg-[#f4f4f5] hover:text-[#18181b]"
      >
        <TabIcon path={ICONS.signOut} />
      </button>
    </form>
  ) : (
    <Link
      href="/sign-in"
      aria-label="Sign in"
      className="flex h-9 w-9 items-center justify-center rounded-full text-[#71717a] hover:bg-[#f4f4f5] hover:text-[#18181b]"
    >
      <TabIcon path={ICONS.signIn} />
    </Link>
  );

  return (
    <>
      <nav className="flex h-16 items-center justify-between border-b border-[#e4e4e7] bg-white px-4 sm:px-10">
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
            <span className="font-[600]">MyHumbleFitness</span>
          </div>
          <div className="hidden gap-6 text-sm sm:flex">
            <Link href="/">Today</Link>
            <Link href="/chat">Chat</Link>
            <Link href="/settings">Settings</Link>
          </div>
        </div>
        {authButton}
      </nav>

      <nav
        data-testid="mobile-tabs"
        className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-[#e4e4e7] bg-white pb-5 pt-2 sm:hidden"
      >
        <Link href="/" className="flex flex-col items-center gap-0.5 text-[#71717a]">
          <TabIcon path={ICONS.today} />
          <span className="text-[10px] font-medium">Today</span>
        </Link>
        <Link href="/chat" className="flex flex-col items-center gap-0.5 text-[#71717a]">
          <TabIcon path={ICONS.chat} />
          <span className="text-[10px] font-medium">Chat</span>
        </Link>
        <Link href="/settings" className="flex flex-col items-center gap-0.5 text-[#71717a]">
          <TabIcon path={ICONS.settings} />
          <span className="text-[10px] font-medium">Settings</span>
        </Link>
      </nav>
    </>
  );
}
