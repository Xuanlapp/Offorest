import { createContext, useContext, useEffect, useState } from 'react'
import { AUTH_LOGOUT_EVENT, getCurrentUser } from '../services/authService'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getCurrentUser())

  useEffect(() => {
    const syncUserFromStorage = () => {
      setUser(getCurrentUser())
    }

    const handleStorage = (event) => {
      if (!event || event.key === null || event.key === 'user') {
        syncUserFromStorage()
      }
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener(AUTH_LOGOUT_EVENT, syncUserFromStorage)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener(AUTH_LOGOUT_EVENT, syncUserFromStorage)
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
