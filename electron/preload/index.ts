// electron/preload/index.ts — 将在 Task 6 中完善
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {})
