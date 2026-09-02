import { auth } from '@/auth'
import SignInButtons from '@/components/SignInButtons'
import { getToday } from '@/app/actions/getToday'
import { getWeek } from '@/app/actions/getWeek'
import { getActivity } from '@/app/actions/getActivity'
import { prisma } from '@/lib/db'
import HomeClient from './HomeClient'

// Reads the session and today's meals on every request.
export const dynamic = 'force-dynamic'

export default async function Home() {
  const session = await auth()

  if (!session?.user?.id) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 p-16 text-center">
        <h1 className="text-2xl font-semibold">Nutrition Coach</h1>
        <p className="text-zinc-500">
          Sign in to start logging meals against your daily targets.
        </p>
        <SignInButtons />
      </main>
    )
  }

  const [today, week, activity, lastCoach] = await Promise.all([
    getToday(),
    getWeek(),
    getActivity(),
    prisma.chatMessage.findFirst({
      where: { userId: session.user.id, role: 'assistant' },
      orderBy: { createdAt: 'desc' },
    }),
  ])
  return (
    <>
      <HomeClient today={today} week={week} activity={activity} coachMessage={lastCoach?.content ?? null} />
    </>
  )
}
