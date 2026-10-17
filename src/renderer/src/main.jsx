import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { init } from './lib/chat.js'
import './styles/app.css'

createRoot(document.getElementById('root')).render(<App />)
init()
