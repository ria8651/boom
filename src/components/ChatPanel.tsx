import { useChat, type ReceivedChatMessage } from "@livekit/components-react";
import { useCallback, useEffect, useRef, useState } from "react";
import "./ChatPanel.css";

type MergedItem =
  | { type: "chat"; msg: ReceivedChatMessage; ts: number }
  | { type: "system"; id: string; text: string; ts: number };

function mergedMessages(
  chat: ReceivedChatMessage[],
  system: { id: string; text: string; timestamp: number }[],
): MergedItem[] {
  const items: MergedItem[] = [
    ...chat.map((msg) => ({ type: "chat" as const, msg, ts: msg.timestamp ?? 0 })),
    ...system.map((s) => ({ type: "system" as const, id: s.id, text: s.text, ts: s.timestamp })),
  ];
  items.sort((a, b) => a.ts - b.ts);
  return items;
}

interface SystemMessage {
  id: string;
  text: string;
  timestamp: number;
}

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
  onError: (message: string) => void;
  systemMessages: SystemMessage[];
}

export default function ChatPanel({ open, onClose, onError, systemMessages }: ChatPanelProps) {
  const { chatMessages, send, isSending } = useChat();
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState("");
  const messagesEndRef = useRef<HTMLLIElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 192)}px`; // max ~8 lines
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setSendError("");
    setDraft("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    try {
      await send(text);
    } catch (err) {
      setDraft(text); // restore the draft
      const msg = err instanceof Error ? err.message : String(err);
      setSendError("Failed to send message");
      onError(`Chat error: ${msg}. This may be caused by a missing secure (HTTPS) connection.`);
    }
  };

  const panelRef = useRef<HTMLElement>(null);

  const handleDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const panel = panelRef.current;
    if (!panel) return;
    const startX = e.clientX;
    const startWidth = panel.offsetWidth;
    const onMove = (ev: MouseEvent) => {
      const newWidth = startWidth + (startX - ev.clientX);
      panel.style.width = `${Math.max(260, Math.min(newWidth, window.innerWidth * 0.75))}px`;
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  return (
    <aside
      ref={panelRef}
      aria-label="Chat"
      className={`chat-panel${open ? "" : " chat-panel--hidden"}`}
    >
      <div
        className="chat-drag-handle focus-divider focus-divider--vertical"
        onMouseDown={handleDrag}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize chat panel"
      />
      <header className="chat-header">
        <h2 className="chat-header-title">Chat</h2>
        <button className="chat-close" onClick={onClose} aria-label="Close chat">
          &times;
        </button>
      </header>

      <ol className="chat-messages">
        {mergedMessages(chatMessages, systemMessages).map((item) =>
          item.type === "system" ? (
            <li key={item.id} className="chat-system">
              {item.text}
            </li>
          ) : (
            <li key={item.msg.id} className="chat-entry">
              <div className="chat-meta">
                <span>{item.msg.from?.name || item.msg.from?.identity || "Unknown"}</span>
                <time dateTime={item.msg.timestamp ? new Date(item.msg.timestamp).toISOString() : undefined}>
                  {item.msg.timestamp
                    ? new Date(item.msg.timestamp).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : ""}
                </time>
              </div>
              <p
                className={`chat-bubble ${
                  item.msg.from?.isLocal ? "chat-bubble--local" : "chat-bubble--remote"
                }`}
              >
                {item.msg.message}
              </p>
            </li>
          ),
        )}
        <li ref={messagesEndRef} aria-hidden="true" />
      </ol>

      <form className="chat-form" onSubmit={handleSubmit}>
        <div className={`chat-input-wrap${sendError ? " chat-input-wrap--error" : ""}`}>
          <textarea
            ref={textareaRef}
            className="chat-input"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setSendError(""); autoResize(); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Enter a message..."
            rows={1}
            autoFocus
          />
          <button
            className="chat-send"
            type="submit"
            disabled={isSending || !draft.trim()}
            aria-label="Send message"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
        {sendError && <span className="chat-send-error">{sendError}</span>}
      </form>
    </aside>
  );
}
