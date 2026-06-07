import { create } from 'zustand'
import type { Document } from '../../shared/types'

interface DocumentStore {
  documents: Document[]
  currentDocument: Document | null
  openDocuments: Document[]
  loading: boolean
  setDocuments: (docs: Document[]) => void
  setCurrentDocument: (doc: Document | null) => void
  setOpenDocuments: (docs: Document[]) => void
  setLoading: (loading: boolean) => void
  addDocument: (doc: Document) => void
  removeDocument: (id: string) => void
  openDocument: (doc: Document) => void
  closeDocument: (id: string) => void
}

export const useDocumentStore = create<DocumentStore>((set) => ({
  documents: [],
  currentDocument: null,
  openDocuments: [],
  loading: false,
  setDocuments: (documents) => set({ documents }),
  setCurrentDocument: (currentDocument) => set({ currentDocument }),
  setOpenDocuments: (openDocuments) => set({ openDocuments }),
  setLoading: (loading) => set({ loading }),
  addDocument: (doc) => set((state) => ({ documents: [...state.documents, doc] })),
  removeDocument: (id) => set((state) => ({
    documents: state.documents.filter((d) => d.id !== id),
    openDocuments: state.openDocuments.filter((d) => d.id !== id),
    currentDocument: state.currentDocument?.id === id ? null : state.currentDocument,
  })),
  openDocument: (doc) => set((state) => ({
    currentDocument: doc,
    openDocuments: state.openDocuments.find((d) => d.id === doc.id)
      ? state.openDocuments
      : [...state.openDocuments, doc],
  })),
  closeDocument: (id) => set((state) => {
    const newOpen = state.openDocuments.filter((d) => d.id !== id)
    return {
      openDocuments: newOpen,
      currentDocument: state.currentDocument?.id === id ? (newOpen[0] || null) : state.currentDocument,
    }
  }),
}))
