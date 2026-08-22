/** Who Stark is talking to. */
const USER = 'Vincent'

/** Openers by time of day, so it never says "good morning" at midnight. */
const OPENERS: { until: number; lines: string[] }[] = [
  {
    until: 5,
    lines: [`Working late, ${USER}.`, `Still up, ${USER}.`, `Late shift, ${USER}.`],
  },
  {
    until: 12,
    lines: [`Good morning, ${USER}.`, `Morning, ${USER}.`, `Top of the morning, ${USER}.`],
  },
  {
    until: 17,
    lines: [`Good afternoon, ${USER}.`, `Afternoon, ${USER}.`],
  },
  {
    until: 24,
    lines: [`Good evening, ${USER}.`, `Evening, ${USER}.`],
  },
]

/** Status line plus an offer. Spoken, so all of them stay short. */
const CLOSERS = [
  'All systems are online. How can I help?',
  'Everything is running. What do you need?',
  'Systems nominal. What can I do for you?',
  'Standing by. What is first?',
  'All green. Where shall we start?',
  'At your service. What do you need?',
  'Online and listening. What can I do?',
  'Ready when you are.',
]

function pick<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)]
}

/**
 * Spoken once, on launch. Randomised so it does not sound like a recording:
 * the opener and closer are drawn independently, which is why a handful of
 * each yields enough combinations that a repeat is rare.
 *
 * `now` and `rng` are injectable so every branch can be tested.
 */
export function greeting(now: Date = new Date(), rng: () => number = Math.random): string {
  const hour = now.getHours()
  const bucket = OPENERS.find((b) => hour < b.until) ?? OPENERS[OPENERS.length - 1]
  return `${pick(bucket.lines, rng)} ${pick(CLOSERS, rng)}`
}
