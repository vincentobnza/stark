/** Who Stark is talking to. */
const USER = 'Vincent'

/**
 * Spoken once, on launch. Time-aware so it does not say "good morning" at
 * midnight, and short because it is heard rather than read.
 */
export function greeting(now: Date = new Date()): string {
  const hour = now.getHours()
  const part =
    hour < 5
      ? 'Working late'
      : hour < 12
        ? 'Good morning'
        : hour < 17
          ? 'Good afternoon'
          : 'Good evening'

  return `${part}, ${USER}. All systems are online. How can I help?`
}
