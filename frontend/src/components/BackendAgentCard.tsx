import { motion } from 'framer-motion'
import { memo } from 'react'

type BackendAgentCardProps = {
  backendAgent: any
  index: number
  Icon: any
  isSelected: boolean
  steeringContexts: string[]
  onBind: (id: string) => void
  activeTargetTitle?: string | undefined
}

function BackendAgentCard({ backendAgent, index, Icon, isSelected, steeringContexts, onBind, activeTargetTitle }: BackendAgentCardProps) {
  return (
    <motion.button
      key={backendAgent.id}
      type="button"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1], delay: Math.min(index, 8) * 0.035 }}
      whileHover={{ y: -4, scale: 1.008 }}
      onClick={() => onBind(backendAgent.id)}
      className={`matrix-card matrix-card-${backendAgent.category} ${isSelected ? 'matrix-card-selected' : ''}`}
    >
      <div className="matrix-card-glow" aria-hidden="true"></div>
      <div className="matrix-card-head">
        <div className="matrix-card-icon">
          <Icon strokeWidth={1.8} />
        </div>
        <div className="matrix-card-badges">
          <span className="matrix-card-category">{backendAgent.category}</span>
          {isSelected && <span className="matrix-card-active">steuert {activeTargetTitle}</span>}
        </div>
      </div>

      <div className="space-y-3 text-left">
        <h3 className="text-2xl font-serif text-ink">{backendAgent.name}</h3>
        <p className="text-sm leading-7 text-smoke">{backendAgent.description}</p>
      </div>

      <div className="matrix-card-meta">
        <div className="matrix-card-targets">
          {backendAgent.backendTargets.map((target: string) => (
            <span key={target} className="matrix-card-target">
              {target}
            </span>
          ))}
        </div>

        {steeringContexts.length > 0 && (
          <div className="matrix-card-contexts">
            {steeringContexts.map((context) => (
              <span key={`${backendAgent.id}-${context}`} className="matrix-card-context">
                {context}
              </span>
            ))}
          </div>
        )}

        <div className="matrix-card-path">{backendAgent.sourcePath}</div>
      </div>
    </motion.button>
  )
}

export default memo(BackendAgentCard)
