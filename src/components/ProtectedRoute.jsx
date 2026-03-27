import { Navigate } from 'react-router-dom'
import { hasPermission, isAuthenticated } from '../services/authService'

export default function ProtectedRoute({ user, permissions = [], children }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />
  }

  const allowed = hasPermission(user, permissions)

  if (!allowed) {
    return <Navigate to="/no-permission" replace />
  }

  return children
}