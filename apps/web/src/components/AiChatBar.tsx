import { useState } from 'react'
import { api } from '../api-client.js'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export function AiChatBar() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setError('')
    setBusy(true)

    const next: ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    try {
      const { text: reply } = await api.aiChat(next.map((m) => ({ role: m.role, content: m.content })))
      setMessages([...next, { role: 'assistant', content: reply }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI request failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ai-chat-bar">
      {messages.length > 0 && (
        <div className="ai-chat-log flex flex-col gap-2" aria-live="polite">
          {messages.slice(-8).map((m, i) => (
            <div key={i} className={`ai-chat-msg ai-chat-msg-${m.role}`}>
              <span className="ai-chat-who">{m.role === 'user' ? 'Вы' : 'Viking'}</span>
              <div className="ai-chat-bubble">{m.content}</div>
            </div>
          ))}
          {busy && (
            <div className="ai-chat-msg ai-chat-msg-assistant">
              <span className="ai-chat-who">Viking</span>
              <div className="ai-chat-bubble">
                <span className="ai-chat-typing">···</span>
              </div>
            </div>
          )}
          {error && <div className="ai-chat-msg ai-chat-msg-error">{error}</div>}
        </div>
      )}
      <div className="ai-chat-input-row">
        <input
          type="text"
          className="ai-chat-input"
          placeholder="Спросите ИИ…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send()
          }}
          disabled={busy}
        />
        <button
          type="button"
          className="ai-chat-send"
          onClick={() => void send()}
          disabled={busy || !input.trim()}
          title="Отправить"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16" aria-hidden="true">
            <path d="M8 1.5a.75.75 0 0 1 .75.75v9.19l2.22-2.22a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 1 1 1.06-1.06l2.22 2.22V2.25A.75.75 0 0 1 8 1.5Z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
