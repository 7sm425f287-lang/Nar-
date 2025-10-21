import { BrowserRouter, Route, Routes } from 'react-router-dom'

import ChatPage from './pages/ChatPage'
import ChronikPage from './pages/ChronikPage'
import DevConsolePage from './pages/DevConsolePage'
import EditorPage from './pages/EditorPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ChatPage />} />
        <Route path="/editor" element={<EditorPage />} />
        <Route path="/chronik" element={<ChronikPage />} />
        <Route path="/dev" element={<DevConsolePage />} />
      </Routes>
    </BrowserRouter>
  )
}
