import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import { hydratePromptsFromPromptsMoi } from './prompt/PromptsMoiService'

const serializeLogArg = (value) => {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ''}`
  }

  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const setupFileConsoleLogging = () => {
  const logger = window?.offorestLogger
  if (!logger?.append) return

  const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  }

  const patchMethod = (method, level) => {
    console[method] = (...args) => {
      original[method](...args)
      const message = args.map(serializeLogArg).join(' | ')
      logger.append({ level, message }).catch(() => {
        // Ignore logging-to-file failures to avoid affecting app flow.
      })
    }
  }

  patchMethod('log', 'log')
  patchMethod('info', 'info')
  patchMethod('warn', 'warn')
  patchMethod('error', 'error')
}

const bootstrap = async () => {
  setupFileConsoleLogging()
  await hydratePromptsFromPromptsMoi()

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

bootstrap()