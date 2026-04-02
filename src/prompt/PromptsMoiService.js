import { PROMPTS } from './Prompts'
import { PROMPTS_MOI } from './PromptsMoi'

const LOCAL_FALLBACK_KEY = 'offorest_prompts_moi_fallback'

const getPromptStoreApi = () => {
  if (typeof window === 'undefined') return null
  return window.offorestPromptStore || null
}

const readLocalFallback = () => {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(LOCAL_FALLBACK_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const writeLocalFallback = (nextData) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(nextData))
}

export const getPromptsMoiPath = async () => {
  const api = getPromptStoreApi()
  if (!api?.getPath) {
    return 'browser-localStorage'
  }

  try {
    return await api.getPath()
  } catch {
    return null
  }
}

export const hydratePromptsFromPromptsMoi = async () => {
  try {
    Object.entries(PROMPTS_MOI || {}).forEach(([key, value]) => {
      if (typeof value === 'string' && key in PROMPTS) {
        PROMPTS[key] = value
      }
    })

    const api = getPromptStoreApi()
    if (!api?.load) {
      const localOverrides = readLocalFallback()
      Object.entries(localOverrides).forEach(([key, value]) => {
        if (typeof value === 'string' && key in PROMPTS) {
          PROMPTS[key] = value
        }
      })
      return
    }

    const overrides = await api.load()
    if (!overrides || typeof overrides !== 'object') return

    Object.entries(overrides).forEach(([key, value]) => {
      if (typeof value === 'string' && key in PROMPTS) {
        PROMPTS[key] = value
      }
    })
  } catch (error) {
    console.error('[PromptsMoiService] Failed to hydrate prompts:', error)
  }
}

export const savePromptToPromptsMoi = async (promptKey, promptValue) => {
  const nextValue = String(promptValue ?? '')
  PROMPTS[promptKey] = nextValue

  const api = getPromptStoreApi()
  if (!api?.save) {
    const current = readLocalFallback()
    writeLocalFallback({
      ...current,
      [promptKey]: nextValue,
    })
    return
  }

  try {
    await api.save(promptKey, nextValue)
  } catch (error) {
    console.error('[PromptsMoiService] Failed to save prompt:', error)
    throw error
  }
}

export const removePromptFromPromptsMoi = async (promptKey) => {
  const api = getPromptStoreApi()
  if (!api?.remove) {
    const current = readLocalFallback()
    const next = { ...current }
    delete next[promptKey]
    writeLocalFallback(next)
    return
  }

  try {
    await api.remove(promptKey)
  } catch (error) {
    console.error('[PromptsMoiService] Failed to remove prompt:', error)
    throw error
  }
}
