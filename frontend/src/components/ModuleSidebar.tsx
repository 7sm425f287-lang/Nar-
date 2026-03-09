import { AnimatePresence, motion } from 'framer-motion'
import { Hammer, ScrollText, Sparkles, SquarePen, TerminalSquare } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useState } from 'react'

import { type AgentId, useAgentRuntime } from '@/lib/agent-runtime'
import { cn } from '@/lib/utils'

const iconMap: Record<AgentId, typeof Hammer> = {
  resonanz: Sparkles,
  schmiede: Hammer,
  editor: SquarePen,
  chronik: ScrollText,
  dev: TerminalSquare,
}

const ease = [0.22, 1, 0.36, 1] as const

export default function ModuleSidebar() {
  const [expanded, setExpanded] = useState(false)
  const { agents, navigateToAgent } = useAgentRuntime()
  const core = agents.find((agent) => agent.id === 'resonanz')
  const items = agents.filter((agent) => agent.id !== 'resonanz')

  return (
    <motion.aside
      className="module-rail"
      animate={{ width: expanded ? 220 : 86 }}
      transition={{ duration: 0.26, ease }}
      onHoverStart={() => setExpanded(true)}
      onHoverEnd={() => setExpanded(false)}
    >
      <div className="module-rail-shell">
        <div className="module-rail-brand">
          {core && (
            <button type="button" className="module-core-button" onClick={() => navigateToAgent('resonanz')}>
              <motion.div
                animate={{
                  opacity: [0.68, 1, 0.68],
                  scale: [0.98, 1.04, 0.98],
                }}
                transition={{ duration: 5.4, repeat: Infinity, ease: 'easeInOut' }}
                className={cn('module-rail-core', `module-rail-core-${core.frequency}`)}
              >
                φ
              </motion.div>

              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    key="core-copy"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.18, ease }}
                    className="module-core-copy"
                  >
                    <span className="module-core-title">Alpha · {core.title}</span>
                    <span className="module-core-subtitle">{core.status.detail}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          )}
        </div>

        <nav className="module-rail-nav" aria-label="Mφrlin Agentenstatus">
          {items.map((item) => {
            const Icon = iconMap[item.id]
            return (
              <NavLink key={item.route} to={item.route}>
                {({ isActive }) => (
                  <motion.div
                    whileHover={{ x: 2 }}
                    transition={{ duration: 0.2, ease }}
                    className={cn(
                      'module-link',
                      `module-link-${item.frequency}`,
                      isActive && 'module-link-active',
                      item.status.tone === 'busy' && 'module-link-busy',
                      item.status.tone === 'delegated' && 'module-link-delegated',
                      item.status.tone === 'error' && 'module-link-error',
                    )}
                  >
                    <div className="module-link-icon-wrap">
                      <Icon className="module-link-icon" strokeWidth={1.8} />
                    </div>

                    <AnimatePresence initial={false}>
                      {expanded && (
                        <motion.div
                          key={`${item.route}-label`}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -8 }}
                          transition={{ duration: 0.18, ease }}
                          className="module-link-copy"
                        >
                          <span className="module-link-label">{item.title}</span>
                          <span className="module-link-summary">{item.status.detail}</span>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <span className={cn('module-link-state', `module-link-state-${item.status.tone}`)}>
                      {item.status.label}
                    </span>
                  </motion.div>
                )}
              </NavLink>
            )
          })}
        </nav>
      </div>
    </motion.aside>
  )
}
