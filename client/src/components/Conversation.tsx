import { useEffect, useRef, useState } from 'react';
import type { Message } from '../types';
import './Conversation.css';

interface Props {
  messages: Message[];
  clientName: string;
  myName: string;
}

export default function Conversation({ messages, clientName, myName }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  async function handleCopy(messageId: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      setCopiedId(messageId);
      copyTimeoutRef.current = window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard API failed - silently fail, button just won't show checkmark
    }
  }

  function formatTime(timestamp: string) {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
           ' ' + date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  return (
    <div className="conversation">
      {messages.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">💬</div>
          <h3>Start the conversation</h3>
          <p className="empty-hint">
            Paste what {clientName} said, then craft your response with AI assistance.
          </p>
        </div>
      ) : (
        messages.map(msg => (
          <div key={msg.id} className={`message ${msg.from}`}>
            <div className="message-header">
              <span className="sender">{msg.from === 'client' ? clientName : myName}</span>
              <div className="message-actions">
                <button
                  className={`copy-btn ${copiedId === msg.id ? 'copied' : ''}`}
                  onClick={() => handleCopy(msg.id, msg.text)}
                  title="Copy message"
                >
                  {copiedId === msg.id ? '✓' : '📋'}
                </button>
                <span className="time">{formatTime(msg.timestamp)}</span>
              </div>
            </div>
            <div className="message-text">{msg.text}</div>
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}
