'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { sendChatMessage } from '@/app/actions/sendChatMessage'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

interface Message {
  id: string
  role: string
  content: string
}

interface ChatClientProps {
  initialMessages: Array<{
    id: string
    role: string
    content: string
  }>
}

export default function ChatClient({ initialMessages }: ChatClientProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  // Telegram-side conversation lands in the DB; a server refresh replaces the
  // list (adjust-during-render, not an effect), and the interval below makes
  // that happen without a manual reload.
  const [prevInitial, setPrevInitial] = useState(initialMessages)
  if (prevInitial !== initialMessages) {
    setPrevInitial(initialMessages)
    setMessages(initialMessages)
  }

  useEffect(() => {
    const id = setInterval(() => router.refresh(), 15000)
    return () => clearInterval(id)
  }, [router])

  const handleSend = async () => {
    const trimmedInput = input.trim()
    if (!trimmedInput) return

    setIsLoading(true)
    setError(null)

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmedInput,
    }

    try {
      const response = await sendChatMessage(trimmedInput)
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.assistantReply,
      }

      setMessages((prev) => [...prev, userMessage, assistantMessage])
      setInput('')
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('An unknown error occurred')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={msg.role === 'user' ? 'text-right' : 'text-left'}
          >
            <div className="inline-block rounded-lg px-3 py-2 bg-muted">
              {msg.content}
            </div>
          </div>
        ))}
        {error && <p className="text-red-500 text-sm">{error}</p>}
      </div>

      <div className="flex gap-2">
        <div className="flex flex-col flex-1 gap-1.5">
          <Label htmlFor="chat-input">Message</Label>
          <Input
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            disabled={isLoading}
          />
        </div>
        <Button
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
        >
          Send
        </Button>
      </div>
    </div>
  )
}