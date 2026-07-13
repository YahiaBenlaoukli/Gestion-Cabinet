import { createContext, useContext } from 'react'

interface LayoutContextType {
  collapsed: boolean
  setCollapsed: React.Dispatch<React.SetStateAction<boolean>>
}

export const LayoutContext = createContext<LayoutContextType>({
  collapsed: false,
  setCollapsed: () => { },
})

export const useLayout = () => useContext(LayoutContext)
