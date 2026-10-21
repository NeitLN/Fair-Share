import { useEffect, useState } from 'react'

/**
 * Seconds elapsed since `running` became true, counting up once a second.
 * Returns 0 while not running and resets to 0 when running turns false.
 */
export function useElapsedSeconds(running: boolean): number {
  const [seconds, setSeconds] = useState(0)
  const [wasRunning, setWasRunning] = useState(running)

  // Reset during render, so the counter never shows the previous run's value for a frame
  if (running !== wasRunning) {
    setWasRunning(running)
    setSeconds(0)
  }

  useEffect(() => {
    if (!running) return

    const startedAt = Date.now()
    const timer = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [running])

  return seconds
}
