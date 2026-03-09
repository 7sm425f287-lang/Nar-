import { AnimatePresence, motion } from 'framer-motion'
import { memo } from 'react'

import { type AgentId, useAgentNode } from '@/lib/agent-runtime'

type AgentFieldProps = {
  agentId: AgentId
  compact?: boolean
  notice?: string | null
}

function AgentField({ agentId, compact = false, notice }: AgentFieldProps) {
  const { agent, principles } = useAgentNode(agentId)
  const constraintLimit = compact ? 2 : 3

  return (
    <section className={`agent-brief ${compact ? 'agent-brief-compact' : ''}`}>
      <div className="agent-brief-head">
        <div>
          <div className="status-rune">{agent.status.label}</div>
          <h2 className="agent-brief-title">{agent.title}</h2>
        </div>
        <div className={`agent-frequency agent-frequency-${agent.frequency}`}>
          <span>{agent.frequency}</span>
        </div>
      </div>

      <p className="agent-brief-copy">{agent.essence}</p>

      <div className="agent-legacy-copy">
        {agent.legacy}
        {principles && <span> · Prinzipienquelle: {principles.source}</span>}
      </div>

      {agent.steeringAgent && (
        <div className="agent-steering-copy">
          <span className="agent-steering-label">Steuernde Emanation</span>
          <span className="agent-steering-name">{agent.steeringAgent.name}</span>
          <span className="agent-steering-meta">{agent.steeringAgent.description}</span>
        </div>
      )}

      <ul className="agent-constraint-list">
        {agent.coreConstraints.slice(0, constraintLimit).map((constraint) => (
          <li key={constraint}>{constraint}</li>
        ))}
      </ul>

      <AnimatePresence initial={false}>
        {notice && (
          <motion.div
            key={notice}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className="agent-command-banner"
          >
            {notice}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
export default memo(AgentField)
