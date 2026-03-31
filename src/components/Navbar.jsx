import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { NavLink } from 'react-router-dom'
import { NAV_ITEMS } from '../config/nav.config'
import { hasPermission, logout } from '../services/authService'
import { useAuth } from '../contexts/AuthContext'
import { testBackendConnection } from '../services/googleDriveService'
import {
  MessageCircle,
  Palette,
  Video,
  Pencil,
  Grid3x3,
  Copy,
  Smartphone,
  LogOut,
} from 'lucide-react'

const iconMap = {
  MessageCircle,
  Palette,
  Video,
  Pencil,
  Grid3x3,
  Copy,
  Smartphone,
}

export default function Navbar({ user }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { setUser } = useAuth()
  const [accessToken, setAccessToken] = useState('')
  const [comboStickerSheetUrl, setComboStickerSheetUrl] = useState('')
  const [holoarcylicSheetUrl, setHoloarcylicSheetUrl] = useState('')
  const [suncatcherSheetUrl, setSuncatcherSheetUrl] = useState('')
  const [stickerSheetUrl, setStickerSheetUrl] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem('googleDriveAccessToken')
    if (saved) setAccessToken(saved)

    // ComboSticker
    const savedComboData = localStorage.getItem('comboStickerSheetData')
    if (savedComboData) {
      try {
        const data = JSON.parse(savedComboData)
        setComboStickerSheetUrl(`https://docs.google.com/spreadsheets/d/${data.sheetId}/edit${data.gid ? `?gid=${data.gid}` : ''}`)
      } catch (error) {
        console.warn('Could not parse combo sheet data:', error)
      }
    }

    // Holoarcylic
    const savedHoloUrl = localStorage.getItem('holoarcylicSheetUrl')
    if (savedHoloUrl) setHoloarcylicSheetUrl(savedHoloUrl)

    // Suncatcher
    const savedSuncatcherUrl = localStorage.getItem('suncatcherSheetUrl') || localStorage.getItem('ornamentSheetUrl')
    if (savedSuncatcherUrl) setSuncatcherSheetUrl(savedSuncatcherUrl)

    // Sticker
    const savedStickerUrl = localStorage.getItem('stickerSheetUrl')
    if (savedStickerUrl) setStickerSheetUrl(savedStickerUrl)
  }, [])

  const handleAccessTokenChange = (value) => {
    setAccessToken(value)
    localStorage.setItem('googleDriveAccessToken', value)
  }

  const handleComboStickerSheetUrlChange = (value) => {
    setComboStickerSheetUrl(value)
    const sheetIdMatch = value.match(/\/d\/([a-zA-Z0-9-_]+)/)
    if (sheetIdMatch) {
      const sheetId = sheetIdMatch[1]
      let gid = null
      const gidMatch = value.match(/[?&]gid=([0-9]+)/)
      if (gidMatch) {
        gid = gidMatch[1]
      }
      const sheetData = { sheetId, gid }
      localStorage.setItem('comboStickerSheetData', JSON.stringify(sheetData))
    }
  }

  const handleHoloarcylicSheetUrlChange = (value) => {
    setHoloarcylicSheetUrl(value)
    localStorage.setItem('holoarcylicSheetUrl', value)
  }

  const handleSuncatcherSheetUrlChange = (value) => {
    setSuncatcherSheetUrl(value)
    localStorage.setItem('suncatcherSheetUrl', value)
  }

  const handleStickerSheetUrlChange = (value) => {
    setStickerSheetUrl(value)
    localStorage.setItem('stickerSheetUrl', value)
  }

  const handleTestAuth = async () => {
    try {
      const result = await testBackendConnection()
      if (result.success) {
        alert('✅ Authentication successful! Backend connection OK.')
      } else {
        alert(`❌ Authentication failed: ${result.error}`)
      }
    } catch (error) {
      alert(`❌ Test failed: ${error.message}`)
    }
  }

  const handleLogout = () => {
    logout()
    setUser(null)
    navigate('/login', { replace: true })
  }

  // Page detection
  const isComboStickerPage = location.pathname === '/combosticker'
  const isHoloarcylicPage = location.pathname === '/holoarcylic'
  const isSuncatcherPage = location.pathname === '/suncatcher'
  const isStickerPage = location.pathname === '/sticker'

  return (
    <header className="w-full bg-zinc-900 px-4 py-4 flex justify-center z-20 border-b border-zinc-800">
      <div className="w-full max-w-7xl flex items-center justify-between gap-4">
        <div className="bg-zinc-800 border border-zinc-700 rounded-full p-1 flex items-center space-x shadow-lg overflow-x">
        {NAV_ITEMS.map((item) => {
          const allowed = hasPermission(user, item.permissions)
          const Icon = iconMap[item.icon]
          const isActive = location.pathname === item.path

          if (!allowed) return null

          return (
            <NavLink
              key={item.key}
              to={item.path}
              className={`relative group px-4 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center space-x-2 ${
                isActive
                  ? 'bg-white/20 text-white'
                  : 'text-white hover:bg-zinc-700'
              }`}
              aria-label={item.label}
            >
              {Icon && <Icon className="w-4 h-4" />}
              <span>{item.label}</span>
              {item.badge && (
                <span className={`absolute -top-2 -right-1 ${item.badgeColor} text-white text-xs font-bold px-1.5 py-0.5 rounded`}>
                  {item.badge}
                </span>
              )}
            </NavLink>
          )
        })}
        </div>

        {/* Google Drive Access Token Input */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-400">Access Token:</span>
            <input
              type="password"
              placeholder="Google API Access Token"
              className="px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-indigo-400 focus:outline-none"
              value={accessToken}
              onChange={(e) => handleAccessTokenChange(e.target.value)}
            />
          </div>

          {/* Google Sheet URL - Page-specific inputs */}
          {(isComboStickerPage || isHoloarcylicPage || isSuncatcherPage || isStickerPage) && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-400">Sheet URL:</span>
              <div className="flex gap-1">
                <input
                  type="text"
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-indigo-400 focus:outline-none w-80"
                  value={isComboStickerPage ? comboStickerSheetUrl : isHoloarcylicPage ? holoarcylicSheetUrl : isSuncatcherPage ? suncatcherSheetUrl : stickerSheetUrl}
                  onChange={(e) => {
                    if (isComboStickerPage) handleComboStickerSheetUrlChange(e.target.value)
                    else if (isHoloarcylicPage) handleHoloarcylicSheetUrlChange(e.target.value)
                    else if (isSuncatcherPage) handleSuncatcherSheetUrlChange(e.target.value)
                    else if (isStickerPage) handleStickerSheetUrlChange(e.target.value)
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    // For Holoarcylic and Suncatcher, trigger Get Data
                    if (isHoloarcylicPage) {
                      window.dispatchEvent(new Event('holoarcylicGetData'))
                      return
                    }
                    if (isSuncatcherPage) {
                      window.dispatchEvent(new Event('suncatcherGetData'))
                      return
                    }
                    if (isStickerPage) {
                      window.dispatchEvent(new Event('stickerGetData'))
                      return
                    }

                    // For ComboSticker, validate URL
                    const currentUrl = comboStickerSheetUrl
                    
                    if (!currentUrl.trim()) {
                      alert('Vui lòng nhập URL Google Sheet!')
                      return
                    }

                    // Parse sheet ID
                    const sheetIdMatch = currentUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)
                    if (!sheetIdMatch) {
                      alert('URL Google Sheet không hợp lệ! Định dạng đúng: https://docs.google.com/spreadsheets/d/SHEET_ID/edit')
                      return
                    }

                    const sheetId = sheetIdMatch[1]

                    // Parse gid (sheet tab ID) nếu có
                    let gid = null
                    const gidMatch = currentUrl.match(/[?&]gid=([0-9]+)/)
                    if (gidMatch) {
                      gid = gidMatch[1]
                    }

                    // Lưu cả sheet ID và gid
                    const sheetData = { sheetId, gid }
                    localStorage.setItem('comboStickerSheetData', JSON.stringify(sheetData))

                    let message = `✅ URL hợp lệ! Sheet ID: ${sheetId}`
                    if (gid) {
                      message += `\n📄 Tab ID: ${gid}`
                    }

                    alert(message)
                  }}
                  className={`px-2 py-1.5 rounded-lg text-white text-sm font-semibold transition ${
                    isHoloarcylicPage || isSuncatcherPage || isStickerPage
                      ? 'bg-blue-500 hover:bg-blue-600'
                      : 'bg-green-500 hover:bg-green-600'
                  }`}
                  title={isHoloarcylicPage || isSuncatcherPage || isStickerPage ? 'Tải dữ liệu từ sheet' : 'Kiểm tra URL'}
                >
                  {isHoloarcylicPage || isSuncatcherPage || isStickerPage ? 'Get Data' : '✓'}
                </button>
              </div>
            </div>
          )}

        

          <button
            type="button"
            onClick={handleLogout}
            className="shrink-0 inline-flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-100 transition-colors hover:bg-red-500/20"
          >
            <LogOut className="h-4 w-4" />
            <span>Đăng xuất</span>
          </button>
        </div>
      </div>
    </header>
  )
}