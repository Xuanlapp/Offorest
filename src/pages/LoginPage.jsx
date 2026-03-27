import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDefaultPathForUser, login } from '../services/authService'
import { useAuth } from '../contexts/AuthContext'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { setUser } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (!username || !password) {
        setError('Vui lòng nhập tài khoản và mật khẩu')
        setLoading(false)
        return
      }
      const user = await login(username, password)
      setUser(user)
      const targetPath = getDefaultPathForUser(user)
      navigate(targetPath, { replace: true })
    } catch (err) {
      console.error('Login failed:', err)
      setError(err.message || 'Đăng nhập thất bại. Vui lòng kiểm tra tài khoản và mật khẩu.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0d12] flex items-center justify-center">
      <div className="bg-[#1a1d23] p-8 rounded-lg shadow-lg w-full max-w-md">
        <h2 className="text-2xl font-bold text-white text-center mb-6">
          Đăng nhập
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-300 mb-1">
              Tài khoản
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 bg-[#2a2d33] border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Nhập tài khoản"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
              Mật khẩu
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-[#2a2d33] border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Nhập mật khẩu"
              required
            />
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2 px-4 rounded-md transition duration-200"
          >
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  )
}