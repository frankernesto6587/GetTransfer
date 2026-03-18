import { useCallback, useRef, useEffect } from 'react'

export function useDebouncedCallback<T extends (...args: any[]) => void>(
  fn: T,
  delay = 300,
): T {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return useCallback(
    (...args: any[]) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => fnRef.current(...args), delay)
    },
    [delay],
  ) as T
}
