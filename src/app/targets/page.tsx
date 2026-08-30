import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import DailyTargetForm from "@/components/DailyTargetForm"

export const dynamic = 'force-dynamic'

export default async function TargetsPage() {
  const session = await auth()

  if (!session?.user?.id) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p>Sign in to set targets</p>
      </div>
    )
  }

  const target = await prisma.dailyTarget.findUnique({
    where: {
      userId: session.user.id
    }
  })

  return (
    <div className="container mx-auto py-8">
      <div className="max-w-md mx-auto">
        <DailyTargetForm initial={target ?? null} />
      </div>
    </div>
  )
}