'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'

import { useAssistant } from '@/lib/state/assistant-provider'

import { AssistantPanel } from './assistant-panel'

/**
 * The docked assistant.
 *
 * On desktop it takes real estate beside the content rather than floating over
 * it — the assistant is a pane of the application, not an overlay you dismiss.
 * Below `xl` it becomes a slide-over, because at that width a permanent column
 * would leave nothing for the work itself.
 */
export function AssistantDock() {
  const assistant = useAssistant()

  useEffect(() => {
    if (!assistant.open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') assistant.setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [assistant])

  /*
   * Unmount rather than animate out on a client page.
   *
   * Gating only on `open` left the exiting <aside> in the DOM at zero size —
   * invisible, but still reachable by assistive tech on a surface where Ask Tru
   * is not offered at all. Availability is a structural question, not a
   * transition, so it short-circuits before AnimatePresence.
   */
  if (!assistant.available) return null

  return (
    <>
      {/* Desktop: a real column. */}
      <AnimatePresence initial={false}>
        {assistant.open ? (
          <motion.aside
            key="dock"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 420, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="hidden shrink-0 overflow-hidden border-l xl:block"
            aria-label="Ask Tru"
          >
            <div className="h-full w-[420px]">
              <AssistantPanel />
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>

      {/* Tablet and mobile: slide-over. */}
      <AnimatePresence>
        {assistant.open ? (
          <div className="fixed inset-0 z-40 xl:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 bg-background/70 backdrop-blur-[2px]"
              onClick={() => assistant.setOpen(false)}
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-y-0 right-0 w-[min(26rem,100vw)] border-l shadow-pop"
              role="dialog"
              aria-label="Ask Tru"
            >
              <AssistantPanel />
            </motion.aside>
          </div>
        ) : null}
      </AnimatePresence>
    </>
  )
}
