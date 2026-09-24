import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { NAV_ITEMS } from '../config/nav.config'
import { hasPermission } from '../services/authService'
import { testBackendConnection } from '../services/googleDriveService'
import {
  MessageCircle,
  Palette,
  Video,
  Pencil,
  Grid3x3,
  Copy,
  Smartphone,
  SunMedium,
  Orbit,
  Sticker,
  Scissors,
  ChevronDown,
  Brush,
  ShieldUser,

} from 'lucide-react'
import ListedItemsModal from '../modals/ListedItemsModal'

const iconMap = {
  MessageCircle,
  Palette,
  Video,
  Pencil,
  Grid3x3,
  Copy,
  Smartphone,
  SunMedium,
  Orbit,
  Sticker,
  Scissors,
  Brush,
  ShieldUser,
}

export default function Navbar({ user }) {
  const appLogoSrc = `${import.meta.env.BASE_URL}logo.jpg`
  const location = useLocation()
  const navigate = useNavigate()
  const [accessToken, setAccessToken] = useState('')
  const [comboStickerSheetUrl, setComboStickerSheetUrl] = useState('')
  const [holoarcylicSheetUrl, setHoloarcylicSheetUrl] = useState('')
  const [suncatcherSheetUrl, setSuncatcherSheetUrl] = useState('')
  const [stickerSheetUrl, setStickerSheetUrl] = useState('')
  const [mockupSheetUrl, setMockupSheetUrl] = useState('')
  const [patchSheetUrl, setPatchSheetUrl] = useState('')
  const [redesignSheetUrl, setRedesignSheetUrl] = useState('')
  const [isListedItemsModalOpen, setIsListedItemsModalOpen] = useState(false)
  const [showNavMenu, setShowNavMenu] = useState(false)
  const navMenuRef = useRef(null)

  const displayName = user?.name || user?.full_name || user?.username || 'User'
  const allowedNavItems = NAV_ITEMS.filter((item) => hasPermission(user, item.permissions))
  const activeNavItem =
    allowedNavItems.find((item) => location.pathname === item.path) ||
    allowedNavItems[0] ||
    null

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

    // Mockup
    const savedMockupUrl = localStorage.getItem('mockupSheetUrl')
    if (savedMockupUrl) setMockupSheetUrl(savedMockupUrl)

    // Patch
    const savedPatchUrl = localStorage.getItem('patchSheetUrl')
    if (savedPatchUrl) setPatchSheetUrl(savedPatchUrl)

    // Redesign
    const savedRedesignUrl = localStorage.getItem('redesignSheetUrl')
    if (savedRedesignUrl) setRedesignSheetUrl(savedRedesignUrl)

  }, [])

  useEffect(() => {
    setShowNavMenu(false)
  }, [location.pathname])

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (navMenuRef.current && !navMenuRef.current.contains(event.target)) {
        setShowNavMenu(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
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

  const handleMockupSheetUrlChange = (value) => {
    setMockupSheetUrl(value)
    localStorage.setItem('mockupSheetUrl', value)
  }

  const handlePatchSheetUrlChange = (value) => {
    setPatchSheetUrl(value)
    localStorage.setItem('patchSheetUrl', value)
  }

  const handleRedesignSheetUrlChange = (value) => {
    setRedesignSheetUrl(value)
    localStorage.setItem('redesignSheetUrl', value)
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

  // Page detection
  const isComboStickerPage = location.pathname === '/combosticker'
  const isHoloarcylicPage = location.pathname === '/holoarcylic'
  const isSuncatcherPage = location.pathname === '/suncatcher'
  const isStickerPage = location.pathname === '/sticker'
  const isMockupPage = location.pathname === '/mockup'
  const isPatchPage = location.pathname === '/patch'
  const isRedesignPage = location.pathname === '/redesign'
  const isAdminPage = location.pathname === '/admin'

  return (
    <header className="w-full bg-zinc-900 px-4 py-4 flex justify-center z-20 border-b border-zinc-800">
      <div className="w-full max-w-7xl flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800 shadow-lg">
            <img src={appLogoSrc} alt="App logo" className="h-full w-full object-cover" />
          </div>
          <div className="relative" ref={navMenuRef}>
            <button
              type="button"
              onClick={() => setShowNavMenu((prev) => !prev)}
              className="bg-zinc-800 border border-zinc-700 rounded-full px-4 py-1.5 text-sm font-medium text-white flex items-center gap-2 shadow-lg hover:bg-zinc-700 transition"
              aria-label="Open page navigation"
            >
              {activeNavItem?.icon && iconMap[activeNavItem.icon] ? (() => {
                const ActiveIcon = iconMap[activeNavItem.icon]
                return <ActiveIcon className="w-4 h-4" />
              })() : null}
              <span>{activeNavItem?.label || 'Chọn trang'}</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showNavMenu ? 'rotate-180' : ''}`} />
            </button>

            {showNavMenu && allowedNavItems.length > 1 ? (
              <div className="absolute left-full top-0 ml-2 z-30 min-w-52 overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 shadow-xl">
                {allowedNavItems.map((item) => {
                  const Icon = iconMap[item.icon]
                  const isActive = location.pathname === item.path

                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        navigate(item.path)
                        setShowNavMenu(false)
                      }}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition ${isActive
                        ? 'bg-zinc-800 text-white'
                        : 'text-zinc-200 hover:bg-zinc-800 hover:text-white'
                        }`}
                    >
                      <span className="flex items-center gap-2">
                        {Icon ? <Icon className="w-4 h-4" /> : null}
                        <span>{item.label}</span>
                      </span>
                      {item.badge ? (
                        <span className={`${item.badgeColor} text-white text-xs font-bold px-1.5 py-0.5 rounded`}>
                          {item.badge}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
        </div>

        {!isAdminPage && (
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

            {(isComboStickerPage || isHoloarcylicPage || isSuncatcherPage || isStickerPage || isMockupPage || isPatchPage || isRedesignPage) && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-zinc-400">Sheet URL:</span>
                <div className="flex gap-1">
                  <input
                    type="text"
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-indigo-400 focus:outline-none w-80"
                    value={isComboStickerPage ? comboStickerSheetUrl : isHoloarcylicPage ? holoarcylicSheetUrl : isSuncatcherPage ? suncatcherSheetUrl : isMockupPage ? mockupSheetUrl : isPatchPage ? patchSheetUrl : isRedesignPage ? redesignSheetUrl : stickerSheetUrl}
                    onChange={(e) => {
                      if (isComboStickerPage) handleComboStickerSheetUrlChange(e.target.value)
                      else if (isHoloarcylicPage) handleHoloarcylicSheetUrlChange(e.target.value)
                      else if (isSuncatcherPage) handleSuncatcherSheetUrlChange(e.target.value)
                      else if (isStickerPage) handleStickerSheetUrlChange(e.target.value)
                      else if (isMockupPage) handleMockupSheetUrlChange(e.target.value)
                      else if (isPatchPage) handlePatchSheetUrlChange(e.target.value)
                      else if (isRedesignPage) handleRedesignSheetUrlChange(e.target.value)
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      // Lưu URL hiện tại vào localStorage (nếu có thay đổi) trước khi reload
                      if (isHoloarcylicPage) {
                        if (holoarcylicSheetUrl.trim()) localStorage.setItem('holoarcylicSheetUrl', holoarcylicSheetUrl.trim())
                        window.dispatchEvent(new Event('holoarcylicGetData'))
                        return
                      }
                      if (isSuncatcherPage) {
                        if (suncatcherSheetUrl.trim()) localStorage.setItem('suncatcherSheetUrl', suncatcherSheetUrl.trim())
                        window.dispatchEvent(new Event('suncatcherGetData'))
                        return
                      }
                      if (isStickerPage) {
                        if (stickerSheetUrl.trim()) localStorage.setItem('stickerSheetUrl', stickerSheetUrl.trim())
                        window.dispatchEvent(new Event('stickerGetData'))
                        return
                      }
                      if (isMockupPage) {
                        if (mockupSheetUrl.trim()) localStorage.setItem('mockupSheetUrl', mockupSheetUrl.trim())
                        window.dispatchEvent(new Event('mockupGetData'))
                        return
                      }
                      if (isPatchPage) {
                        if (patchSheetUrl.trim()) localStorage.setItem('patchSheetUrl', patchSheetUrl.trim())
                        window.dispatchEvent(new Event('patchGetData'))
                        return
                      }
                      if (isRedesignPage) {
                        if (redesignSheetUrl.trim()) localStorage.setItem('redesignSheetUrl', redesignSheetUrl.trim())
                        window.dispatchEvent(new Event('redesignGetData'))
                        return
                      }

                      const currentUrl = comboStickerSheetUrl

                      if (!currentUrl.trim()) {
                        alert('Vui lòng nhập URL Google Sheet!')
                        return
                      }

                      const sheetIdMatch = currentUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)
                      if (!sheetIdMatch) {
                        alert('URL Google Sheet không hợp lệ! Định dạng đúng: https://docs.google.com/spreadsheets/d/SHEET_ID/edit')
                        return
                      }

                      const sheetId = sheetIdMatch[1]

                      let gid = null
                      const gidMatch = currentUrl.match(/[?&]gid=([0-9]+)/)
                      if (gidMatch) {
                        gid = gidMatch[1]
                      }

                      const sheetData = { sheetId, gid }
                      localStorage.setItem('comboStickerSheetData', JSON.stringify(sheetData))

                      let message = `✅ URL hợp lệ! Sheet ID: ${sheetId}`
                      if (gid) {
                        message += `\n📄 Tab ID: ${gid}`
                      }

                      alert(message)
                    }}
                    className={`px-2 py-1.5 rounded-lg text-white text-sm font-semibold transition ${isHoloarcylicPage || isSuncatcherPage || isStickerPage || isMockupPage || isPatchPage || isRedesignPage
                      ? 'bg-blue-500 hover:bg-blue-600'
                      : 'bg-green-500 hover:bg-green-600'
                      }`}
                    title={isHoloarcylicPage || isSuncatcherPage || isStickerPage || isMockupPage || isPatchPage ? 'Tải dữ liệu từ sheet' : 'Kiểm tra URL'}
                  >
                    {isHoloarcylicPage || isSuncatcherPage || isStickerPage || isMockupPage || isPatchPage || isRedesignPage ? 'Get Data' : '✓'}
                  </button>
                
                </div>
              </div>
            )}
          </div>
        )}

        <div className="relative flex items-center gap-2 text-white">
          <span className="max-w-40 truncate text-sm font-medium text-zinc-100">{displayName}</span>
        </div>
        <ListedItemsModal
          isOpen={isListedItemsModalOpen}
          onClose={() => setIsListedItemsModalOpen(false)}
          sheetUrl={
            isComboStickerPage ? comboStickerSheetUrl :
              isHoloarcylicPage ? holoarcylicSheetUrl :
                isSuncatcherPage ? suncatcherSheetUrl :
                  isStickerPage ? stickerSheetUrl :
                    isMockupPage ? mockupSheetUrl :
                      isPatchPage ? patchSheetUrl :
                        isRedesignPage ? redesignSheetUrl : ''
          }
        />
      </div>
    </header>
  )
}
