import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { createLinkToken } from "@/lib/telegramLink"
import DailyTargetForm from "@/components/DailyTargetForm"
import ConnectTelegram from "@/components/ConnectTelegram"
import DeleteAccount from "@/components/DeleteAccount"

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const session = await auth()

  if (!session?.user?.id) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p>Sign in to view settings</p>
      </div>
    )
  }

  const [target, telegramChat] = await Promise.all([
    prisma.dailyTarget.findUnique({
      where: {
        userId: session.user.id
      }
    }),
    prisma.telegramChat.findUnique({
      where: {
        userId: session.user.id
      }
    }),
  ])

  // Minting on every render is fine: the token upserts per user and the
  // deep link only has to survive the tap that follows.
  let linkUrl: string | null = null
  if (!telegramChat) {
    const { token } = await createLinkToken(session.user.id)
    linkUrl = `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=${token}`
  }

  return (
    <div className="container mx-auto py-8">
      <div className="max-w-md mx-auto">
        <DailyTargetForm initial={target ?? null} />
        <ConnectTelegram linked={Boolean(telegramChat)} linkUrl={linkUrl} />
        <DeleteAccount />
      </div>
    </div>
  )
}
