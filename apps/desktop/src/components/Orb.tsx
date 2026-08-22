import { motion } from 'motion/react'
import type { Status } from '../state/store'

interface Look {
  /** Outer bloom strength. */
  glow: number
  /** Equator brightness. */
  seam: number
  /** Breathing period in seconds. */
  breath: number
  tint: string
}

const LOOK: Record<Status, Look> = {
  idle: { glow: 0.4, seam: 0.6, breath: 7, tint: '#4a6bf0' },
  listening: { glow: 1, seam: 1, breath: 2.4, tint: '#4d9bff' },
  transcribing: { glow: 0.75, seam: 0.85, breath: 3, tint: '#5a7cf5' },
  thinking: { glow: 0.65, seam: 0.5, breath: 2, tint: '#7b4ce8' },
  awaiting: { glow: 0.85, seam: 0.9, breath: 4, tint: '#e0a24f' },
  speaking: { glow: 1.1, seam: 1, breath: 1.6, tint: '#4fc3ff' },
}

/** Filament spokes, displaced by turbulence into plasma. */
const SPOKES = [0, 26, 52, 78, 104, 130, 156]

interface Props {
  status: Status
  /** Live microphone amplitude, 0-1. Drives the reactive swell. */
  level?: number
  /** Mic is open and the gate is armed. Shows the outer listening ring. */
  armed?: boolean
}

export function Orb({ status, level = 0, armed = false }: Props) {
  const look = LOOK[status]
  // Mic energy widens the sphere and lights the seam.
  const swell = 1 + level * 0.075
  const seam = Math.min(1, look.seam + level * 0.5)
  const glow = Math.min(1.4, look.glow + level * 0.5)

  return (
    <svg viewBox="0 0 400 400" className="size-full overflow-visible">
      <defs>
        {/* Sphere volume: cool highlight upper-left falling to violet depth. */}
        <radialGradient id="orb-body" cx="36%" cy="28%" r="82%">
          <stop offset="0%" stopColor="#e2ecff" stopOpacity="0.60" />
          <stop offset="26%" stopColor={look.tint} stopOpacity="0.62" />
          <stop offset="66%" stopColor="#6636d4" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#160f46" stopOpacity="0.52" />
        </radialGradient>

        {/* Glass edge: nothing in the middle, bright right at the limb. */}
        <radialGradient id="orb-rim" cx="50%" cy="50%" r="50%">
          <stop offset="80%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="93%" stopColor="#cfe2ff" stopOpacity="0.30" />
          <stop offset="98.5%" stopColor="#e8f2ff" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#8fb6ff" stopOpacity="0.2" />
        </radialGradient>

        {/* The spokes that turbulence tears into filaments. */}
        <linearGradient id="orb-wisp" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#cfe6ff" stopOpacity="0" />
          <stop offset="35%" stopColor="#dbefff" stopOpacity="0.5" />
          <stop offset="65%" stopColor="#dbefff" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#cfe6ff" stopOpacity="0" />
        </linearGradient>

        <linearGradient id="orb-seam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#cfe6ff" stopOpacity="0" />
          <stop offset="16%" stopColor="#dff0ff" stopOpacity="0.75" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="84%" stopColor="#dff0ff" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#cfe6ff" stopOpacity="0" />
        </linearGradient>

        <clipPath id="orb-clip">
          <circle cx="200" cy="200" r="128" />
        </clipPath>

        <filter id="orb-plasma" x="-45%" y="-45%" width="190%" height="190%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.009 0.032"
            numOctaves="4"
            seed="11"
            result="noise"
          >
            <animate
              attributeName="baseFrequency"
              values="0.009 0.032; 0.015 0.024; 0.009 0.032"
              dur="22s"
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="104"
            xChannelSelector="R"
            yChannelSelector="G"
          />
          <feGaussianBlur stdDeviation="1.1" />
        </filter>

        <filter id="orb-bloom" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="30" />
        </filter>

        <filter id="orb-seam-bloom" x="-30%" y="-400%" width="160%" height="900%">
          <feGaussianBlur stdDeviation="6" />
        </filter>

        <filter id="orb-spec" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="13" />
        </filter>
      </defs>

      {/* Ambient bloom behind the glass */}
      <motion.circle
        cx="200"
        cy="200"
        r="130"
        fill={look.tint}
        filter="url(#orb-bloom)"
        animate={{ opacity: [glow * 0.4, glow * 0.72, glow * 0.4] }}
        transition={{ duration: look.breath, repeat: Infinity, ease: 'easeInOut' }}
      />

      {armed && (
        <>
          {/* Slow ticked ring: the resting sign that the mic is open. */}
          <motion.circle
            cx="200"
            cy="200"
            r="152"
            fill="none"
            stroke={look.tint}
            strokeWidth="1"
            strokeDasharray="1.5 9"
            opacity={0.28}
            animate={{ rotate: 360 }}
            transition={{ duration: 70, repeat: Infinity, ease: 'linear' }}
            style={{ originX: '200px', originY: '200px' }}
          />
          {/* Level ring: expands and brightens with what the room is doing. */}
          <circle
            cx="200"
            cy="200"
            r={150 + level * 14}
            fill="none"
            stroke="#dff0ff"
            strokeWidth={0.6 + level * 1.4}
            opacity={0.06 + level * 0.55}
          />
        </>
      )}

      <motion.g
        animate={{ scale: [swell, swell * 1.02, swell] }}
        transition={{ duration: look.breath, repeat: Infinity, ease: 'easeInOut' }}
        style={{ originX: '200px', originY: '200px' }}
      >
        <circle cx="200" cy="200" r="128" fill="url(#orb-body)" />

        <g clipPath="url(#orb-clip)">
          {/* Slowly turning filament field */}
          <motion.g
            filter="url(#orb-plasma)"
            animate={{ rotate: 360 }}
            transition={{ duration: 150, repeat: Infinity, ease: 'linear' }}
            style={{ originX: '200px', originY: '200px' }}
          >
            {SPOKES.map((angle) => (
              <rect
                key={angle}
                x="72"
                y="192"
                width="256"
                height="16"
                fill="url(#orb-wisp)"
                transform={`rotate(${angle} 200 200)`}
              />
            ))}
          </motion.g>

          {/* Specular kiss, upper left */}
          <ellipse
            cx="148"
            cy="128"
            rx="46"
            ry="29"
            fill="#ffffff"
            opacity="0.30"
            filter="url(#orb-spec)"
          />
        </g>

        <circle cx="200" cy="200" r="128" fill="url(#orb-rim)" />

        {/* The equator: a hard bright line overhanging the limb */}
        <motion.g
          animate={{ opacity: [seam * 0.72, seam, seam * 0.72] }}
          transition={{ duration: look.breath / 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <rect
            x="38"
            y="196.2"
            width="324"
            height="7.6"
            fill="url(#orb-seam)"
            filter="url(#orb-seam-bloom)"
            opacity="0.85"
          />
          <rect x="46" y="199.1" width="308" height="1.8" fill="url(#orb-seam)" />
          <rect x="118" y="199.5" width="164" height="1" fill="#ffffff" opacity="0.95" />
        </motion.g>
      </motion.g>
    </svg>
  )
}
