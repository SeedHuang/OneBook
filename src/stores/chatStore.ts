import { create } from 'zustand'
import type { Conversation, Message } from '../../shared/types'

interface ChatStore {
  conversations: Conversation[]
  currentConversation: Conversation | null
  messages: Message[]
  streaming: boolean
  streamContent: string
  setConversations: (list: Conversation[]) => void
  setCurrentConversation: (conv: Conversation | null) => void
  setMessages: (msgs: Message[]) => void
  setStreaming: (v: boolean) => void
  setStreamContent: (v: string) => void
  appendStreamContent: (chunk: string) => void
  addMessage: (msg: Message) => void
  addConversation: (conv: Conversation) => void
  removeConversation: (id: string) => void
  removeMessages: (ids: string[]) => void
  updateConversationTokens: (id: string, totalTokens: number) => void
}

export const useChatStore = create<ChatStore>((set) => ({
  conversations: [],
  currentConversation: null,
  messages: [],
  streaming: false,
  streamContent: '',
  setConversations: (conversations) => set({ conversations }),
  setCurrentConversation: (currentConversation) => set({ currentConversation }),
  setMessages: (messages) => set({ messages }),
  setStreaming: (streaming) => set({ streaming }),
  setStreamContent: (streamContent) => set({ streamContent }),
  appendStreamContent: (chunk) => set((state) => ({ streamContent: state.streamContent + chunk })),
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  addConversation: (conv) => set((state) => ({ conversations: [...state.conversations, conv] })),
  removeConversation: (id) => set((state) => ({
    conversations: state.conversations.filter((c) => c.id !== id),
    currentConversation: state.currentConversation?.id === id ? null : state.currentConversation,
    messages: state.currentConversation?.id === id ? [] : state.messages,
  })),
  removeMessages: (ids) => set((state) => ({
    messages: state.messages.filter((m) => !ids.includes(m.id)),
  })),
  updateConversationTokens: (id, totalTokens) => set((state) => ({
    conversations: state.conversations.map((c) =>
      c.id === id ? { ...c, total_tokens: totalTokens } : c
    ),
    currentConversation: state.currentConversation?.id === id
      ? { ...state.currentConversation, total_tokens: totalTokens }
      : state.currentConversation,
  })),
}))
