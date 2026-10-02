import { motion, useTime, useTransform } from 'motion/react'

const W = 340
const H = 76
const MID = H / 2
const STEPS = 96

interface Layer {
  freq: number
  /** Radians per millisecond. Negative drifts the other way. */
  speed: number
  phase: number
  amp: number
  color: string
  width: number
}

/** Counter-drifting ribbons at different rates read as fluid rather than as a loop. */
const LAYERS: Layer[] = [
  { freq: 1.0, speed: 0.0011, phase: 0.0, amp: 22, color: '#8b5cf6', width: 1.7 },
  { freq: 1.6, speed: -0.0009, phase: 1.2, amp: 16, color: '#5b7cf5', width: 1.4 },
  { freq: 2.4, speed: 0.0015, phase: 2.4, amp: 11, color: '#c4b5fd', width: 1.0 },
  { freq: 0.8, speed: -0.0006, phase: 3.1, amp: 26, color: '#f0b45a', width: 0.9 },
]

/** Fixed positions; a random scatter would jump on every re-render. */
const SPARKS = [
  { x: 52, y: 16, r: 0.9, delay: 0 },
  { x: 88, y: 26, r: 0.7, delay: 1.1 },
  { x: 121, y: 11, r: 1.0, delay: 2.3 },
  { x: 232, y: 18, r: 0.8, delay: 0.7 },
  { x: 274, y: 28, r: 0.6, delay: 1.8 },
  { x: 301, y: 13, r: 0.9, delay: 2.9 },
]

function build(t: number, level: number, layer: Layer): string {
  const gain = 0.22 + level * 1.05
  let d = ''
  for (let i = 0; i <= STEPS; i++) {
    const u = i / STEPS
    const x = u * W
    // Hann-ish envelope so every ribbon resolves into the baseline at the edges.
    const env = Math.pow(Math.sin(Math.PI * u), 1.6)
    const y =
      MID -
      Math.sin(u * layer.freq * Math.PI * 2 + t * layer.speed + layer.phase) *
        layer.amp *
        env *
        gain
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)} `
  }
  return d
}

function Ribbon({ layer, level }: { layer: Layer; level: number }) {
  const time = useTime()
  // A MotionValue keeps the path off React's render path: 96 points times four
  // ribbons at 60fps would otherwise re-render the tree every frame.
  const d = useTransform(time, (t) => build(t, level, layer))
  return (
    <motion.path
      d={d}
      fill="none"
      stroke={layer.color}
      strokeWidth={layer.width}
      strokeLinecap="round"
      opacity={0.85}
    />
  )
}

interface Props {
  /** Mic amplitude, 0-1. Drives ribbon height. */
  level: number
  /** Mic is open. When false the waveform flatlines. */
  active: boolean
}

export function Waveform({ level, active }: Props) {
  const amplitude = active ? level : 0

  return (
    <div className="pointer-events-none h-full w-full">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
        <defs>
          <linearGradient id="wave-base" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0" />
            <stop offset="22%" stopColor="#c4b5fd" stopOpacity="0.75" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="78%" stopColor="#c4b5fd" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
          </linearGradient>

          <filter id="wave-glow" x="-20%" y="-120%" width="140%" height="340%">
            <feGaussianBlur stdDeviation="3.2" />
          </filter>
          <filter id="wave-line-glow" x="-20%" y="-600%" width="140%" height="1300%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
        </defs>

        {active && (
          <>
            {/* Bloomed copy underneath, then the crisp strokes over it. */}
            <g filter="url(#wave-glow)" opacity={0.55 + amplitude * 0.4}>
              {LAYERS.map((layer) => (
                <Ribbon key={`glow-${layer.phase}`} layer={layer} level={amplitude} />
              ))}
            </g>
            <g>
              {LAYERS.map((layer) => (
                <Ribbon key={layer.phase} layer={layer} level={amplitude} />
              ))}
            </g>

            {/* Reflection: the same ribbons mirrored about the baseline. */}
            <g
              transform={`translate(0,${MID * 2}) scale(1,-1)`}
              opacity={0.3}
              filter="url(#wave-glow)"
            >
              {LAYERS.map((layer) => (
                <Ribbon key={`mirror-${layer.phase}`} layer={layer} level={amplitude} />
              ))}
            </g>

            {SPARKS.map((s) => (
              <motion.circle
                key={`${s.x}-${s.y}`}
                cx={s.x}
                cy={s.y}
                r={s.r}
                fill="#e9e4ff"
                animate={{ opacity: [0, 0.9, 0] }}
                transition={{
                  duration: 3.4,
                  repeat: Infinity,
                  delay: s.delay,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </>
        )}

        {/* The baseline: always present, and the whole indicator when muted. */}
        <rect
          x="0"
          y={MID - 1.6}
          width={W}
          height="3.2"
          fill="url(#wave-base)"
          filter="url(#wave-line-glow)"
          opacity={active ? 0.9 : 0.28}
        />
        <rect
          x="0"
          y={MID - 0.35}
          width={W}
          height="0.7"
          fill="url(#wave-base)"
          opacity={active ? 1 : 0.3}
        />

      </svg>
    </div>
  )
}
