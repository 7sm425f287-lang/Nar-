import { BrowserRouter, Route, Routes } from 'react-router-dom'

import ChatPage from './pages/ChatPage'
import ChronikPage from './pages/ChronikPage'
import DevConsolePage from './pages/DevConsolePage'
import EditorPage from './pages/EditorPage'
import PrinciplesModal from './components/PrinciplesModal'

export default function App() {
  return (
    <BrowserRouter>
      <PrinciplesModal />
      <Routes>
        <Route path="/" element={<ChatPage />} />
        <Route path="/editor" element={<EditorPage />} />
        <Route path="/chronik" element={<ChronikPage />} />
        <Route path="/dev" element={<DevConsolePage />} />
      </Routes>
    </BrowserRouter>
  )
}
