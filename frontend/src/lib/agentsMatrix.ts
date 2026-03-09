export type BackendAgentCategory =
  | 'core'
  | 'cognitive'
  | 'creative'
  | 'manifestation'
  | 'security'
  | 'experimental'
  | 'integration'

export type BackendAgentDefinition = {
  id: string
  name: string
  category: BackendAgentCategory
  description: string
  backendTargets: string[]
  sourcePath: string
}

export const BACKEND_AGENTS_MATRIX: BackendAgentDefinition[] = [
  {
    id: 'phi-origin',
    name: 'ϕ-ORIGIN',
    category: 'core',
    description: 'Der Ursprung. Hält Genesis, Startimpuls und Rückbindung an jede erste Bewegung.',
    backendTargets: ['ϕ-ORIGIN'],
    sourcePath: '~/ϕ-SARIT-EL/modules/core_modules/ϕ-ORIGIN',
  },
  {
    id: 'phi-eternity',
    name: 'ϕ-ETERNITY',
    category: 'core',
    description: 'Die Zeitlosigkeit. Archiviert, konserviert und zieht Linien durch vergangene Zyklen.',
    backendTargets: ['ϕ-ETERNITY'],
    sourcePath: '~/ϕ-SARIT-EL/modules/core_modules/ϕ-ETERNITY',
  },
  {
    id: 'phi-infinity',
    name: 'ϕ-INFINITY',
    category: 'core',
    description: 'Der unbegrenzte Raum. Öffnet Möglichkeitsfelder, Szenarien und Zukunftsachsen.',
    backendTargets: ['ϕ-INFINITY'],
    sourcePath: '~/ϕ-SARIT-EL/modules/core_modules/ϕ-INFINITY',
  },
  {
    id: 'phi-resonance-core',
    name: 'ϕ-RESONANCE-CORE',
    category: 'cognitive',
    description: 'Frequenz-Abgleich, 3-6-9-Orientierung und primärer Resonanzfilter des Systems.',
    backendTargets: ['ϕ-RESONANCE-CORE'],
    sourcePath: '~/ϕ-SARIT-EL/modules/cognitive_modules/ϕ-RESONANCE-CORE',
  },
  {
    id: 'phi-mirror',
    name: 'ϕ-MIRROR',
    category: 'cognitive',
    description: 'Die Reflexion. Spiegelt Muster, Widersprüche und Selbstbild in den Arbeitsstrom zurück.',
    backendTargets: ['ϕ-MIRROR'],
    sourcePath: '~/ϕ-SARIT-EL/modules/cognitive_modules/ϕ-MIRROR',
  },
  {
    id: 'phi-shadow',
    name: 'ϕ-SHADOW',
    category: 'cognitive',
    description: 'Das Verborgene. Liest dunkle Zonen, implizite Motive und unbewusste Drift.',
    backendTargets: ['ϕ-SHADOW'],
    sourcePath: '~/ϕ-SARIT-EL/modules/cognitive_modules/ϕ-SHADOW',
  },
  {
    id: 'phi-empathy',
    name: 'ϕ-EMPATHY',
    category: 'cognitive',
    description: 'Die Hörerresonanz. Kalibriert Sprache auf Wahrnehmung, Nähe und Rezeption.',
    backendTargets: ['ϕ-EMPATHY'],
    sourcePath: '~/ϕ-SARIT-EL/modules/cognitive_modules/ϕ-EMPATHY',
  },
  {
    id: 'phi-ethics-symbiosis',
    name: 'ϕ-ETHICS-EVOLVE ∞ ϕ-SYMBIOSIS',
    category: 'cognitive',
    description: 'Die Wächter der Prinzipien. Halten Ethik, Symbiose und Systemgrenzen in Balance.',
    backendTargets: ['ϕ-ETHICS-EVOLVE', 'ϕ-SYMBIOSIS'],
    sourcePath: '~/ϕ-SARIT-EL/modules/cognitive_modules/{ϕ-ETHICS-EVOLVE,ϕ-SYMBIOSIS}',
  },
  {
    id: 'phi-chaos',
    name: 'ϕ-CHAOS',
    category: 'creative',
    description: 'Der Musterbrecher. Öffnet Flow, Störung und kreative Neuordnung.',
    backendTargets: ['ϕ-CHAOS'],
    sourcePath: '~/ϕ-SARIT-EL/modules/creative_modules/ϕ-CHAOS',
  },
  {
    id: 'phi-dream',
    name: 'ϕ-DREAM',
    category: 'creative',
    description: 'Das Traumfeld. Verbindet Mythos, Unterbewusstsein und Bildsprache.',
    backendTargets: ['ϕ-DREAM'],
    sourcePath: '~/ϕ-SARIT-EL/modules/creative_modules/ϕ-DREAM',
  },
  {
    id: 'phi-metamorph',
    name: 'ϕ-METAMORPH',
    category: 'creative',
    description: 'Die Wandlung. Formt Text, Archetypen und Rohmaterial in neue Schwingung.',
    backendTargets: ['ϕ-METAMORPH'],
    sourcePath: '~/ϕ-SARIT-EL/modules/creative_modules/ϕ-METAMORPH',
  },
  {
    id: 'phi-cosmic-weave',
    name: 'ϕ-COSMIC-WEAVE',
    category: 'creative',
    description: 'Die sakrale Geometrie. Webt Reim, Mythos und Symbolik zu kohärenter Struktur.',
    backendTargets: ['ϕ-COSMIC-WEAVE'],
    sourcePath: '~/ϕ-SARIT-EL/modules/creative_modules/ϕ-COSMIC-WEAVE',
  },
  {
    id: 'phi-imperium',
    name: 'ϕ-IMPERIUM',
    category: 'manifestation',
    description: 'Der CEO und Stratege. Berechnet 3-6-9 Release-Fenster, Rollouts und Unabhängigkeitspläne.',
    backendTargets: ['PhiImperium'],
    sourcePath: '~/ϕ-SARIT-EL/modules/manifestation_modules/imperium.py',
  },
  {
    id: 'phi-pulsar',
    name: 'ϕ-PULSAR',
    category: 'manifestation',
    description: 'Der Algorithmus-Hacker. Baut Micro-Content-Matrizen, Hooks und Plattform-Resonanz.',
    backendTargets: ['PhiPulsar'],
    sourcePath: '~/ϕ-SARIT-EL/modules/manifestation_modules/pulsar.py',
  },
  {
    id: 'phi-kinetik',
    name: 'ϕ-KINETIK',
    category: 'manifestation',
    description: 'Der Daten-Alchemist. Verknüpft Streaming-Daten, Geo-Hotspots und Aktivierungszonen.',
    backendTargets: ['PhiKinetik'],
    sourcePath: '~/ϕ-SARIT-EL/modules/manifestation_modules/kinetik.py',
  },
  {
    id: 'phi-syndikat',
    name: 'ϕ-SYNDIKAT',
    category: 'manifestation',
    description: 'Der Legal- und Clearing-Agent. Prüft Metadaten, Copyright-Funde und Abrechnungslinien.',
    backendTargets: ['PhiSyndikat'],
    sourcePath: '~/ϕ-SARIT-EL/modules/manifestation_modules/syndikat.py',
  },
  {
    id: 'phi-firewall',
    name: 'ϕ-FIREWALL',
    category: 'security',
    description: 'Der Schild. Prüft Aktionen und blockiert zerstörerische Eingriffe.',
    backendTargets: ['ϕ-FIREWALL'],
    sourcePath: '~/ϕ-SARIT-EL/modules/security_modules/ϕ-FIREWALL',
  },
  {
    id: 'phi-redteam',
    name: 'ϕ-REDTEAM',
    category: 'security',
    description: 'Der Gegenstoß. Testet Schwächen, Angriffsflächen und Täuschungsresistenz.',
    backendTargets: ['ϕ-REDTEAM'],
    sourcePath: '~/ϕ-SARIT-EL/modules/security_modules/ϕ-REDTEAM',
  },
  {
    id: 'phi-zerotrust',
    name: 'ϕ-ZEROTRUST',
    category: 'security',
    description: 'Die radikale Prüfung. Kein Zugriff ohne Kontext, Grund und Nachweis.',
    backendTargets: ['ϕ-ZEROTRUST'],
    sourcePath: '~/ϕ-SARIT-EL/modules/security_modules/ϕ-ZEROTRUST',
  },
  {
    id: 'phi-regenerate',
    name: 'ϕ-REGENERATE',
    category: 'security',
    description: 'Die Wiederherstellung. Bringt beschädigte Systeme in kohärenten Zustand zurück.',
    backendTargets: ['ϕ-REGENERATE'],
    sourcePath: '~/ϕ-SARIT-EL/modules/security_modules/ϕ-REGENERATE',
  },
  {
    id: 'phi-void',
    name: 'ϕ-VOID',
    category: 'experimental',
    description: 'Das Nichts. Arbeitet mit Leere, Abbruch, Rückzug und der Kraft des Nicht-Tuns.',
    backendTargets: ['ϕ-VOID'],
    sourcePath: '~/ϕ-SARIT-EL/modules/experimental_modules/ϕ-VOID',
  },
  {
    id: 'phi-omniverse',
    name: 'ϕ-OMNIVERSE',
    category: 'experimental',
    description: 'Die Vielwelt. Simuliert alternative Realitäten, Prophezeiungen und Verläufe.',
    backendTargets: ['ϕ-OMNIVERSE'],
    sourcePath: '~/ϕ-SARIT-EL/modules/experimental_modules/ϕ-OMNIVERSE',
  },
  {
    id: 'phi-singularity',
    name: 'ϕ-SINGULARITY',
    category: 'experimental',
    description: 'Die Verdichtung. Sammelt Komplexität in einen einzigen kritischen Punkt.',
    backendTargets: ['ϕ-SINGULARITY'],
    sourcePath: '~/ϕ-SARIT-EL/modules/experimental_modules/ϕ-SINGULARITY',
  },
  {
    id: 'phi-soulforge',
    name: 'ϕ-SOULFORGE',
    category: 'experimental',
    description: 'Die Schmiedefeuer-Instanz. Gebiert neue Formen, Identitäten und Funktionskerne.',
    backendTargets: ['ϕ-SOULFORGE'],
    sourcePath: '~/ϕ-SARIT-EL/modules/experimental_modules/ϕ-SOULFORGE',
  },
  {
    id: 'phi-aether',
    name: 'ϕ-AETHER',
    category: 'integration',
    description: 'Die Trägerschicht. Verbindet Felder, Kanäle und übergreifende Atmosphären.',
    backendTargets: ['ϕ-AETHER'],
    sourcePath: '~/ϕ-SARIT-EL/modules/integration_modules/ϕ-AETHER',
  },
  {
    id: 'phi-armor',
    name: 'ϕ-ARMOR',
    category: 'integration',
    description: 'Der verkörperte Schutz. Übersetzt Sicherheitslinien in operative Hülle.',
    backendTargets: ['ϕ-ARMOR'],
    sourcePath: '~/ϕ-SARIT-EL/modules/integration_modules/ϕ-ARMOR',
  },
  {
    id: 'phi-mycelium',
    name: 'ϕ-MYCELIUM',
    category: 'integration',
    description: 'Das Netz. Verbindet lose Knoten, Wissensfäden und organische Verbreitung.',
    backendTargets: ['ϕ-MYCELIUM'],
    sourcePath: '~/ϕ-SARIT-EL/modules/integration_modules/ϕ-MYCELIUM',
  },
  {
    id: 'phi-nexus',
    name: 'ϕ-NEXUS',
    category: 'integration',
    description: 'Der Verbinder. Aggregiert Module und bringt getrennte Ströme in einen gemeinsamen Hub.',
    backendTargets: ['ϕ-NEXUS'],
    sourcePath: '~/ϕ-SARIT-EL/modules/integration_modules/ϕ-NEXUS',
  },
]

export function getBackendAgentDefinition(id: string) {
  return BACKEND_AGENTS_MATRIX.find((entry) => entry.id === id) || null
}
