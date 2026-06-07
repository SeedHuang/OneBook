import { create } from 'zustand'
import type { AIProvider, AIModel, CreateModelParams } from '../../shared/types'

interface TokenUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

interface SettingsStore {
  provider: AIProvider
  model: string
  tokenMode: 'mkp' | 'manual'
  manualKey: string
  mkpPassword: string
  mkpConnected: boolean
  siderCollapsed: boolean
  chatCollapsed: boolean
  models: AIModel[]
  currentModel: AIModel | null
  tokenUsage: TokenUsage | null
  setProvider: (v: AIProvider) => void
  setModel: (v: string) => void
  setTokenMode: (v: 'mkp' | 'manual') => void
  setManualKey: (v: string) => void
  setMkpPassword: (v: string) => void
  setMkpConnected: (v: boolean) => void
  setSiderCollapsed: (v: boolean) => void
  setChatCollapsed: (v: boolean) => void
  setTokenUsage: (usage: TokenUsage | null) => void
  loadSettings: () => Promise<void>
  loadModels: () => Promise<void>
  createModel: (params: CreateModelParams) => Promise<AIModel>
  updateModel: (id: string, params: Partial<CreateModelParams>) => Promise<AIModel>
  deleteModel: (id: string) => Promise<void>
  setDefaultModel: (id: string) => Promise<void>
  testModel: (id: string) => Promise<boolean>
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  provider: 'deepseek',
  model: 'deepseek-v4',
  tokenMode: 'mkp',
  manualKey: '',
  mkpPassword: '',
  mkpConnected: false,
  siderCollapsed: false,
  chatCollapsed: false,
  models: [],
  currentModel: null,
  tokenUsage: null,
  setProvider: (provider) => set({ provider }),
  setModel: (model) => set({ model }),
  setTokenMode: (tokenMode) => set({ tokenMode }),
  setManualKey: (manualKey) => set({ manualKey }),
  setMkpPassword: (mkpPassword) => set({ mkpPassword }),
  setMkpConnected: (mkpConnected) => set({ mkpConnected }),
  setSiderCollapsed: (siderCollapsed) => set({ siderCollapsed }),
  setChatCollapsed: (chatCollapsed) => set({ chatCollapsed }),
  setTokenUsage: (tokenUsage) => set({ tokenUsage }),
  loadSettings: async () => {
    try {
      const settings = await window.electronAPI.getAllSettings()
      if (settings) {
        set({
          provider: (settings['ai.provider'] as AIProvider) || 'deepseek',
          model: settings['ai.model'] || 'deepseek-v4',
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
  loadModels: async () => {
    const models = await window.electronAPI.listModels()
    set({ models, currentModel: models.find((m: AIModel) => m.is_default) ?? null })
  },
  createModel: async (params) => {
    const model = await window.electronAPI.createModel(params)
    await get().loadModels()
    return model
  },
  updateModel: async (id, params) => {
    const model = await window.electronAPI.updateModel(id, params)
    await get().loadModels()
    return model
  },
  deleteModel: async (id) => {
    await window.electronAPI.deleteModel(id)
    await get().loadModels()
  },
  setDefaultModel: async (id) => {
    await window.electronAPI.setDefaultModel(id)
    await get().loadModels()
  },
  testModel: async (id) => {
    try {
      const res = await window.electronAPI.testModel(id)
      return res.success
    } catch {
      return false
    }
  },
}))
