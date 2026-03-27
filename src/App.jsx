import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'
import LoginPage from './pages/LoginPage'
import NoPermissionPage from './pages/NoPermissionPage'
import { APP_MODES } from './config/nav.modes'
import { getDefaultPathForUser, hasPermission } from './services/authService'
import { AuthProvider, useAuth } from './contexts/AuthContext'

const pageModules = import.meta.glob('./pages/*Page.jsx', { eager: true })

const PAGE_COMPONENTS = Object.fromEntries(
  Object.entries(pageModules).map(([path, module]) => {
    const name = path.split('/').pop().replace('.jsx', '')
    return [name, module.default]
  })
)

function PersistedModePages({ user, appModeList, defaultPath }) {
  const location = useLocation()
  const pathname = location.pathname

  const matchedMode = appModeList.find((mode) => mode.path === pathname)

  if (!matchedMode) {
    return <Navigate to={defaultPath} replace />
  }

  if (!hasPermission(user, matchedMode.permissions || [])) {
    return <Navigate to="/no-permission" replace />
  }

  const accessibleModes = appModeList.filter((mode) =>
    hasPermission(user, mode.permissions || [])
  )

  return (
    <>
      {accessibleModes.map((mode) => {
        const ModeComponent = PAGE_COMPONENTS[mode.component]

        if (!ModeComponent) return null

        return (
          <div
            key={mode.path}
            style={{ display: pathname === mode.path ? 'block' : 'none' }}
            aria-hidden={pathname === mode.path ? 'false' : 'true'}
          >
            <ModeComponent />
          </div>
        )
      })}
    </>
  )
}

function AppRoutes() {
  const { user } = useAuth()
  const authenticated = user !== null
  const defaultPath = getDefaultPathForUser(user)
  const appModeList = Object.values(APP_MODES)

  return (
    <Routes>
      <Route
        path="/login"
        element={authenticated ? <Navigate to={defaultPath} replace /> : <LoginPage />}
      />

      <Route element={<MainLayout />}>
        <Route path="/" element={<Navigate to={defaultPath} replace />} />
        <Route path="/no-permission" element={<NoPermissionPage />} />
        <Route path="/ornament" element={<Navigate to="/suncatcher" replace />} />
        <Route
          path="*"
          element={
            authenticated ? (
              <PersistedModePages
                user={user}
                appModeList={appModeList}
                defaultPath={defaultPath}
              />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Route>
    </Routes>
  )
}

export default function App() {
  const Router =
    typeof window !== 'undefined' && window.location.protocol === 'file:'
      ? HashRouter
      : BrowserRouter

  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  )
}