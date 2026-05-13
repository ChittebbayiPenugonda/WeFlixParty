'use client';

import { useState, useEffect, useRef } from 'react';
import { sendChatMessage, onChatMessages, type ChatMessage } from '@/lib/signaling';

interface ChatSidebarProps {
  roomId: string;
  role: 'host' | 'guest';
  onClose: () => void;
  onCommand?: (cmd: string) => void;
}

// Silent slash commands — no UI hint, no feedback. Easter egg only.
const COMMANDS = new Set(['/react_mr']);

export default function ChatSidebar({ roomId, role, onClose, onCommand }: ChatSidebarProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!roomId) return;
    const unsub = onChatMessages(roomId, setMessages);
    return unsub;
  }, [roomId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = () => {
    const text = input.trim();
    if (!text) return;

    if (text.startsWith('/')) {
      if (COMMANDS.has(text)) onCommand?.(text.slice(1));
      // Unknown commands are silently discarded — no error shown
      setInput('');
      return;
    }

    sendChatMessage(roomId, text, role).catch(console.error);
    setInput('');
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 border-l border-white/10 w-72 shrink-0">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <span className="text-white font-medium text-sm">Chat</span>
        <button
          onClick={onClose}
          className="text-white/40 hover:text-white transition-colors text-lg leading-none"
        >
          ×
        </button>
      </div>

      {/* messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 text-sm">
        {messages.length === 0 && (
          <p className="text-white/30 text-xs text-center mt-4">
            No messages yet. Say hi! 👋
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex flex-col gap-0.5 ${m.sender === role ? 'items-end' : 'items-start'}`}
          >
            <span className="text-white/30 text-xs">
              {m.sender === role ? 'You' : 'Them'}
            </span>
            <div
              className={`px-3 py-1.5 rounded-2xl max-w-[90%] break-words ${
                m.sender === role ? 'bg-indigo-600 text-white' : 'bg-white/10 text-white'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* input */}
      <div className="px-3 py-3 border-t border-white/10 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Type a message…"
          className="flex-1 bg-white/10 text-white placeholder-white/30 rounded-xl px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          onClick={send}
          disabled={!input.trim()}
          className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm transition-colors"
        >
          ↑
        </button>
      </div>
    </div>
  );
}
