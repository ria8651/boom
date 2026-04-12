import { useChat } from "@livekit/components-react";
import { useEffect, useRef, useState } from "react";

interface ChatPanelProps {
  onClose: () => void;
}

export default function ChatPanel({ onClose }: ChatPanelProps) {
  const { chatMessages, send, isSending } = useChat();
  const [draft, setDraft] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    await send(text);
  };

  return (
    <div className="chat-panel line-left">
      <div className="chat-header">
        <span>Chat</span>
        <button className="chat-close" onClick={onClose} aria-label="Close chat">
          &times;
        </button>
      </div>

      <div className="chat-messages">
        {chatMessages.map((msg) => (
          <div key={msg.id} className="chat-entry">
            <div className="chat-meta">
              <span>{msg.from?.name || msg.from?.identity || "Unknown"}</span>
              <span>
                {msg.timestamp
                  ? new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : ""}
              </span>
            </div>
            <div
              className={`chat-bubble ${
                msg.from?.isLocal ? "chat-bubble--local" : "chat-bubble--remote"
              }`}
            >
              {msg.message}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-form line-top" onSubmit={handleSubmit}>
        <input
          className="chat-input"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Enter a message..."
          autoFocus
        />
        <button className="chat-send" type="submit" disabled={isSending || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
