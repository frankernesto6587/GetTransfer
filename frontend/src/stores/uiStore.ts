import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  /** per-table column visibility: { [tableId]: { [columnId]: boolean } } */
  columnVisibility: Record<string, Record<string, boolean>>
  setColumnVisibility: (tableId: string, columnId: string, visible: boolean) => void
  resetColumnVisibility: (tableId: string) => void
  /** per-table page size: { [tableId]: number } */
  pageSize: Record<string, number>
  setPageSize: (tableId: string, size: number) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      columnVisibility: {},

      setColumnVisibility: (tableId, columnId, visible) =>
        set((state) => ({
          columnVisibility: {
            ...state.columnVisibility,
            [tableId]: {
              ...state.columnVisibility[tableId],
              [columnId]: visible,
            },
          },
        })),

      resetColumnVisibility: (tableId) =>
        set((state) => {
          const { [tableId]: _, ...rest } = state.columnVisibility
          return { columnVisibility: rest }
        }),

      pageSize: {},

      setPageSize: (tableId, size) =>
        set((state) => ({
          pageSize: {
            ...state.pageSize,
            [tableId]: size,
          },
        })),
    }),
    {
      name: 'gettransfer-ui-prefs',
    },
  ),
)
