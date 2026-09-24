import { useState, useEffect } from 'react'

const buildTabs = (prompts = {}, defaults = {}) => {
  const hasRedesign =
    Object.prototype.hasOwnProperty.call(prompts, 'redesign')
    || Object.prototype.hasOwnProperty.call(defaults, 'redesign')
  const hasPatch =
    Object.prototype.hasOwnProperty.call(prompts, 'patch')
    || Object.prototype.hasOwnProperty.call(defaults, 'patch')

  const designKey = hasRedesign ? 'redesign' : hasPatch ? 'patch' : 'redesign'
  const mockupKeys = ['MockupPatch1', 'MockupPatch2', 'MockupPatch3']

  const tabs = [{ key: designKey, label: 'Design' }]
  mockupKeys.forEach((key, index) => {
    if (
      Object.prototype.hasOwnProperty.call(prompts, key)
      || Object.prototype.hasOwnProperty.call(defaults, key)
    ) {
      tabs.push({ key, label: `Mockup${index + 1}` })
    }
  })

  return tabs
}

/**
 * @param {object} props
 * @param {boolean}  props.isOpen
 * @param {string}   props.initialTab   - key của tab mở đầu ('patch' | 'MockupPatch1' | ...)
 * @param {object}   props.prompts      - { patch, MockupPatch1, MockupPatch2, MockupPatch3 }
 * @param {object}   props.defaults     - giá trị mặc định tương ứng
 * @param {function} props.onClose
 * @param {function} props.onSave       - (key, value) => void
 * @param {function} props.onReset      - (key) => void
 */
export default function PatchPromptModal({
  isOpen,
  initialTab,
  prompts = {},
  defaults = {},
  onClose,
  onSave,
  onReset,
}) {
  const tabs = buildTabs(prompts, defaults)
  const fallbackTab = tabs[0]?.key || 'redesign'
  const [activeTab, setActiveTab] = useState(initialTab || fallbackTab)
  const [draftValues, setDraftValues] = useState({})
  const [showOldPrompt, setShowOldPrompt] = useState(false)

  // Reset state khi mở modal
  useEffect(() => {
    if (!isOpen) return

    const nextTabs = buildTabs(prompts, defaults)
    const nextFallbackTab = nextTabs[0]?.key || 'redesign'
    const requestedTab = initialTab || nextFallbackTab
    const nextActiveTab = nextTabs.some((tab) => tab.key === requestedTab)
      ? requestedTab
      : nextFallbackTab

    setActiveTab(nextActiveTab)
    setDraftValues({ ...prompts })
    setShowOldPrompt(false)
  }, [isOpen, initialTab, prompts, defaults])

  if (!isOpen) return null

  const activeTabInfo = tabs.find((t) => t.key === activeTab)
  const currentDraft = draftValues[activeTab] ?? ''
  const currentDefault = defaults[activeTab] ?? ''

  const handleSave = async () => {
    await onSave?.(activeTab, currentDraft)
    onClose?.()
  }

  const handleReset = async () => {
    setDraftValues((prev) => ({ ...prev, [activeTab]: currentDefault }))
    await onReset?.(activeTab)
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-3xl flex-col rounded-2xl border border-zinc-200 bg-white shadow-2xl"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
          <h3 className="text-base font-semibold text-zinc-900">Change Prompt - Patch</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
          >
            Close
          </button>
        </div>

        {/* ── Tab bar ── */}
        <div className="flex items-end gap-1 border-b border-zinc-200 px-6 pt-4">
          {tabs.map((tab) => {
            const isActive = tab.key === activeTab
            return (
              <div key={tab.key} className="relative flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.key)
                    setShowOldPrompt(false)
                  }}
                  className={`rounded-full border px-5 py-1.5 text-sm font-semibold transition-all ${
                    isActive
                      ? 'border-zinc-800 bg-white text-zinc-900 font-bold'
                      : 'border-zinc-300 bg-white text-zinc-500 hover:border-zinc-500 hover:text-zinc-700'
                  }`}
                >
                  {tab.label}
                </button>
                {/* Arrow indicator */}
                {isActive && (
                  <div className="mt-1 h-0 w-0 border-x-[7px] border-t-[8px] border-x-transparent border-t-zinc-800" />
                )}
                {!isActive && <div className="mt-1 h-[8px]" />}
              </div>
            )
          })}
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-6 py-4">
          {/* Prompt Cũ (Read Only) */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Prompt Cu (Read Only)
              </span>
              <button
                type="button"
                onClick={() => setShowOldPrompt((prev) => !prev)}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-100"
              >
                {showOldPrompt ? 'Hide Prompt Cu' : 'Show Prompt Cu'}
              </button>
            </div>
            {showOldPrompt && (
              <textarea
                value={currentDefault}
                readOnly
                rows={8}
                className="mt-3 w-full rounded-xl border border-zinc-200 bg-zinc-100 px-3 py-2 text-sm text-zinc-600 resize-y"
              />
            )}
          </div>

          {/* Change Prompt */}
          <div className="rounded-xl border border-zinc-200 bg-white p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Change Prompt
            </p>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-700">
              {activeTabInfo?.label?.toUpperCase()} PROMPT
            </p>
            <textarea
              value={currentDraft}
              onChange={(e) =>
                setDraftValues((prev) => ({ ...prev, [activeTab]: e.target.value }))
              }
              rows={14}
              className="w-full resize-y rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-800 outline-none focus:border-indigo-400"
            />
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-6 py-4">
          <button
            type="button"
            onClick={handleReset}
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100"
          >
            Reset Default
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            Save Prompt
          </button>
        </div>
      </div>
    </div>
  )
}
