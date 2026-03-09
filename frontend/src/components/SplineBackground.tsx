import React, { useEffect, useState } from 'react'

// Lazy-load @splinetool/react-spline only when mounted in browser
export default function SplineBackground() {
  const [Spline, setSpline] = useState<any>(null)

  useEffect(() => {
    let mounted = true
    void import('@splinetool/react-spline')
      .then((mod) => {
        if (mounted) setSpline(() => mod.default || mod)
      })
      .catch(() => {
        // ignore - optional dependency
      })
    return () => {
      mounted = false
    }
  }, [])

  if (!Spline) return null

  // Render Spline with conservative settings; leave scene empty by default.
  // Consumers can override by passing props if needed.
  return (
    <div className="spline-bg" aria-hidden="true" style={{ pointerEvents: 'none' }}>
      {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
      {/* @ts-ignore: runtime import */}
      <Spline scene="" style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
