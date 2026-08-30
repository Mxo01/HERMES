import { useLayoutEffect, useRef, useState } from 'react'

/**
 * True once the element has scrolled into the viewport — and stays true
 * afterward, so a reveal animation plays once rather than replaying every
 * time the user scrolls past it.
 */
export function useInView<T extends HTMLElement>(
  options?: IntersectionObserverInit,
): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)

  // useLayoutEffect, not useEffect: switching views unmounts and remounts
  // this section fresh every time (App only renders the active route), so
  // "already on screen" is the *common* case here, not the exception. With
  // useEffect that first render still commits at opacity-0 and paints before
  // flipping to visible a frame later — one real, visible flash of blank
  // content on every navigation. Measuring before paint lets the already-
  // visible case skip straight to its final state with nothing shown in
  // between, while a section genuinely below the fold still gets the async,
  // scroll-triggered fade exactly as before.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    // Already on screen at mount (e.g. above the fold) — skip straight to
    // visible instead of animating in a section the user never saw hidden.
    const initial = el.getBoundingClientRect()
    if (initial.top < window.innerHeight && initial.bottom > 0) {
      setInView(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -10% 0px', ...options },
    )
    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return [ref, inView]
}
