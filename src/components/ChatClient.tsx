'use client'

import { useEffect, useRef, useState } from 'react'
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

  // A refresh mid-typing would blow away the draft; only poll while idle.
  const inputRef = useRef('')
  useEffect(() => {
    inputRef.current = input
  }, [input])
  useEffect(() => {
    const id = setInterval(() => {
      if (inputRef.current.trim() === '') router.refresh()
    }, 15000)
    return () => clearInterval(id)
  }, [router])

  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: 'end' })
  }, [messages])

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
    <div className="flex h-[calc(100dvh-10rem)] flex-col gap-3">
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto rounded-[14px] border border-[#e4e4e7] bg-white p-4">
        {messages.map((msg) =>
          msg.role === 'user' ? (
            <div
              key={msg.id}
              data-role="user"
              className="max-w-[80%] self-end whitespace-pre-line rounded-2xl rounded-br-sm bg-[#059669] px-4 py-2.5 text-sm text-white"
            >
              {msg.content}
            </div>
          ) : (
            <div key={msg.id} data-role="assistant" className="flex max-w-[85%] gap-2.5 self-start">
              <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#ecfdf5]">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M12 3v18M5 12a7 7 0 0 0 14 0" />
                </svg>
              </div>
              <div className="whitespace-pre-line rounded-2xl rounded-bl-sm border border-[#f0f0f1] bg-[#fafafa] px-4 py-2.5 text-sm text-[#18181b]">
                {msg.content}
              </div>
            </div>
          )
        )}
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div ref={bottomRef} />
      </div>

      {/* One row, vertically centred: the label used to render above the
          input, which pushed the Send button up level with the caption
          instead of the field. Chat composers don't show a caption — it stays
          for screen readers only. */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Label htmlFor="chat-input" className="sr-only">
            Message
          </Label>
          <Input
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // nativeEvent.isComposing: while an IME candidate is open,
              // Enter confirms the word rather than ending the message —
              // sending here would cut it in half.
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                !isLoading &&
                input.trim()
              ) {
                e.preventDefault()
                handleSend()
              }
            }}
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