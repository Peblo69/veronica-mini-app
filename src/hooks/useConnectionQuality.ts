import { useEffect, useState } from 'react'

type ConnectionType = {
  effectiveType: string
  saveData: boolean
  downlink: number
}

const defaultState: ConnectionType = {
  effectiveType: '4g',
  saveData: false,
  downlink: 10,
}

export function useConnectionQuality() {
  const [state, setState] = useState<ConnectionType>(() => {
    if (typeof navigator === 'undefined') {
      return defaultState
    }

    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection
    if (!connection) return defaultState

    return {
      effectiveType: connection.effectiveType || defaultState.effectiveType,
      saveData: connection.saveData || false,
      downlink: connection.downlink || defaultState.downlink,
    }
  })

  useEffect(() => {
    const connection = (navigator as any)?.connection || (navigator as any)?.mozConnection || (navigator as any)?.webkitConnection
    if (!connection) return

    const handler = () => {
      setState({
        effectiveType: connection.effectiveType || defaultState.effectiveType,
        saveData: Boolean(connection.saveData),
        downlink: connection.downlink || defaultState.downlink,
      })
    }

    connection.addEventListener?.('change', handler)
    return () => connection.removeEventListener?.('change', handler)
  }, [])

  const isSlow = state.effectiveType === 'slow-2g' || state.effectiveType === '2g'
  const isDataSaver = state.saveData

  return {
    ...state,
    isSlow,
    isDataSaver,
  }
}
