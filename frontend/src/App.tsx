import { AnimatePresence, motion } from 'framer-motion'
import { BrowserRouter, HashRouter, Route, Routes, useLocation } from 'react-router-dom'

import ModuleSidebar from './components/ModuleSidebar'
import React, { Suspense } from 'react'
const SplineBackground = React.lazy(() => import('./components/SplineBackground'))
import ChatPage from './pages/ChatPage'
import ChronikPage from './pages/ChronikPage'
import DevConsolePage from './pages/DevConsolePage'
import EditorPage from './pages/EditorPage'
import SchmiedePage from './pages/SchmiedePage'
import PrinciplesModal from './components/PrinciplesModal'
import { AgentRuntimeProvider } from './lib/agent-runtime'

function AnimatedRoutes() {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="min-h-screen"
      >
        <Routes location={location}>
          <Route path="/" element={<ChatPage />} />
          <Route path="/schmiede" element={<SchmiedePage />} />
          <Route path="/editor" element={<EditorPage />} />
          <Route path="/chronik" element={<ChronikPage />} />
          <Route path="/dev" element={<DevConsolePage />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}

export default function App() {
  const Router = typeof window !== 'undefined' && window.location.protocol === 'file:'
    ? HashRouter
    : BrowserRouter

  return (
    <Router>
      <AgentRuntimeProvider>
        <PrinciplesModal />
        <div className="app-shell">
          <ModuleSidebar />
          <Suspense fallback={null}>
            <SplineBackground />
          </Suspense>
          <div className="module-content">
            <AnimatedRoutes />
          </div>
        </div>
      </AgentRuntimeProvider>
    </Router>
  )
}
