import { Outlet } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { useAuth } from '../contexts/AuthContext'

export default function MainLayout() {
  const { user } = useAuth()

  return (
    <div className="min-h-screen bg-[] text-white">
      <Navbar user={user} />
      <main className="p-6">
        <div className="mx-auto max-w-screen-2xl">
          <Outlet context={{ user }} />
        </div>
      </main>
    </div>
  )
}