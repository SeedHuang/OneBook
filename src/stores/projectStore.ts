import { create } from 'zustand'
import type { Project } from '../../shared/types'

interface ProjectStore {
  projects: Project[]
  currentProject: Project | null
  loading: boolean
  setProjects: (projects: Project[]) => void
  setCurrentProject: (project: Project | null) => void
  setLoading: (loading: boolean) => void
  addProject: (project: Project) => void
  removeProject: (id: string) => void
  updateProject: (id: string, data: Partial<Project>) => void
}

export const useProjectStore = create<ProjectStore>((set) => ({
  projects: [],
  currentProject: null,
  loading: false,
  setProjects: (projects) => set({ projects }),
  setCurrentProject: (currentProject) => set({ currentProject }),
  setLoading: (loading) => set({ loading }),
  addProject: (project) => set((state) => ({ projects: [...state.projects, project] })),
  removeProject: (id) => set((state) => ({
    projects: state.projects.filter((p) => p.id !== id),
    currentProject: state.currentProject?.id === id ? null : state.currentProject,
  })),
  updateProject: (id, data) => set((state) => ({
    projects: state.projects.map((p) => (p.id === id ? { ...p, ...data } : p)),
    currentProject: state.currentProject?.id === id ? { ...state.currentProject, ...data } : state.currentProject,
  })),
}))
