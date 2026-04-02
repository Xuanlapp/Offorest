import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import { hydratePromptsFromPromptsMoi } from './prompt/PromptsMoiService'

const bootstrap = async () => {
  await hydratePromptsFromPromptsMoi()

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

bootstrap()