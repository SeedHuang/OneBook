import { create } from 'zustand'
import type { AIProvider } from '../../shared/types'

interface SettingsStore {
  provider: AIProvider
  model: string
  tokenMode: 'mkp' | 'manual'
  manualKey: string
  mkpPassword: string
  mkpConnected: boolean
  siderCollapsed: boolean
  chatCollapsed: boolean
  setProvider: (v: AIProvider) => void
  setModel: (v: string) => void
  setTokenMode: (v: 'mkp' | 'manual') => void
  setManualKey: (v: string) => void
  setMkpPassword: (v: string) => void
  setMkpConnected: (v: boolean) => void
  setSiderCollapsed: (v: boolean) => void
  setChatCollapsed: (v: boolean) => void
  loadSettings: () => Promise<void>
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  provider: 'deepseek',
  model: 'deepseek-chat',
  tokenMode: 'mkp',
  manualKey: '',
  mkpPassword: '',
  mkpConnected: false,
  siderCollapsed: false,
  chatCollapsed: false,
  setProvider: (provider) => set({ provider }),
  setModel: (model) => set({ model }),
  setTokenMode: (tokenMode) => set({ tokenMode }),
  setManualKey: (manualKey) => set({ manualKey }),
  setMkpPassword: (mkpPassword) => set({ mkpPassword }),
  setMkpConnected: (mkpConnected) => set({ mkpConnected }),
  setSiderCollapsed: (siderCollapsed) => set({ siderCollapsed }),
  setChatCollapsed: (chatCollapsed) => set({ chatCollapsed }),
  loadSettings: async () => {
    try {
      const settings = await window.electronAPI.getAllSettings()
      if (settings) {
        set({
          provider: (settings['ai.provider'] as AIProvider) || 'deepseek',
          model: settings['ai.model'] || 'deepseek-chat',
          tokenMode: (settings['token.mode'] as 'mkp' | 'manual') || 'mkp',
          manualKey: settings['ai.manualKey'] || '',
          mkpPassword: settings['mkp_master_password'] || '',
        })
      }
      const mkpStatus = await window.electronAPI.getMkpStatus()
      set({ mkpConnected: mkpStatus?.available ?? false })
    } catch {
      // ignore - use defaults
    }
  },
}))
