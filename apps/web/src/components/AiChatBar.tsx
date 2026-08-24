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
        <div className="ai-chat-log" aria-live="polite">
          {messages.slice(-6).map((m, i) => (
            <div key={i} className={`ai-chat-msg ai-chat-msg-${m.role}`}>
              <span className="ai-chat-who">{m.role === 'user' ? 'Вы' : 'ИИ'}:</span>{' '}
              {m.content}
            </div>
          ))}
          {busy && <div className="ai-chat-msg ai-chat-msg-assistant">…</div>}
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
          className="btn btn-sm btn-primary"
          onClick={() => void send()}
          disabled={busy || !input.trim()}
        >
          {busy ? '…' : 'Отправить'}
        </button>
      </div>
    </div>
  )
}
