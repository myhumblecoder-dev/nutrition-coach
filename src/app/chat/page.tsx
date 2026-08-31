import { auth } from '@/auth'
import { getChatHistory } from '@/app/actions/getChatHistory'
import ChatClient from '@/components/ChatClient'

// Reads the session and chat history on every request.
export const dynamic = 'force-dynamic'

export default async function ChatPage() {
  const session = await auth()

  if (!session?.user?.id) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p>Sign in to chat</p>
      </div>
    )
  }

  const messages = await getChatHistory()

  return (
    <div className="mx-auto w-full max-w-2xl p-6">
      <ChatClient initialMessages={messages} />
    </div>
  )
}
