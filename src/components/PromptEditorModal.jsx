import { useEffect, useState } from 'react'

export default function PromptEditorModal({
  isOpen,
  title = 'Change Prompt',
  description = '',
  fields = [],
  onClose,
  onSave,
  onReset,
}) {
  const [draftValues, setDraftValues] = useState({})
  const [showOldPrompts, setShowOldPrompts] = useState(false)
  const [copiedField, setCopiedField] = useState('')

  useEffect(() => {
    if (!isOpen) return

    const nextDraft = {}
    fields.forEach((field) => {
      nextDraft[field.key] = field.value ?? ''
    })
    setDraftValues(nextDraft)
    setShowOldPrompts(false)
    setCopiedField('')
  }, [isOpen, fields])

  if (!isOpen) return null

  const handleSave = () => {
    onSave?.(draftValues)
    onClose?.()
  }

  const fieldsWithOldValue = fields.filter((field) => typeof field.oldValue === 'string')

  const handleCopy = async (key, value) => {
    try {
      await navigator.clipboard.writeText(String(value ?? ''))
      setCopiedField(key)
      setTimeout(() => setCopiedField(''), 1200)
    } catch {
      setCopiedField('')
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900">{title}</h3>
            {description ? <p className="mt-1 text-sm text-zinc-500">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
          >
            Close
          </button>
        </div>

        <div className="mt-4 max-h-[65vh] space-y-4 overflow-y-auto pr-1">
          {fieldsWithOldValue.length ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
                  Prompt Cu (Read Only)
                </p>
                <button
                  type="button"
                  onClick={() => setShowOldPrompts((prev) => !prev)}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-100"
                >
                  {showOldPrompts ? 'Hide Prompt Cu' : 'Show Prompt Cu'}
                </button>
              </div>

              {showOldPrompts ? (
                <div className="mt-3 space-y-3">
                  {fieldsWithOldValue.map((field) => (
                    <div key={`${field.key}-old`}>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
                          {field.label} (Old)
                        </label>
                        <button
                          type="button"
                          onClick={() => handleCopy(field.key, field.oldValue)}
                          className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-100"
                        >
                          {copiedField === field.key ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <textarea
                        value={field.oldValue}
                        readOnly
                        rows={field.oldRows || Math.min(field.rows || 10, 10)}
                        className="w-full rounded-xl border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm text-zinc-700"
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-xl border border-zinc-200 bg-white p-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">
              Change Prompt
            </p>
            <div className="space-y-4">
              {fields.map((field) => (
                <div key={field.key}>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    {field.label}
                  </label>
                  <textarea
                    value={draftValues[field.key] ?? ''}
                    onChange={(event) =>
                      setDraftValues((prev) => ({
                        ...prev,
                        [field.key]: event.target.value,
                      }))
                    }
                    rows={field.rows || 10}
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-700 outline-none focus:border-indigo-300"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {onReset ? (
            <button
              type="button"
              onClick={() => {
                onReset()
                onClose?.()
              }}
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100"
            >
              Reset Default
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            Save Prompt
          </button>
        </div>
      </div>
    </div>
  )
}
