import type { EventProps } from './events'

/**
 * A consult stop is recorded by its gate (`circuit`, `declined`, `under-18`),
 * never by the answer behind it. The client sends the gate already
 * (`consultFunnel.stop`); this keeps an older client, or anyone posting here
 * directly, from writing pregnancy or a kidney or liver condition against a
 * session id.
 */
const STOP_KINDS = new Set(['circuit', 'declined', 'under-18'])
export function scrubHealthProps(event: string, props: EventProps): EventProps {
  if (event !== 'consult_stop') return props
  const reason = props.reason
  if (typeof reason === 'string' && STOP_KINDS.has(reason)) return props
  return { ...props, reason: reason === 'pregnancy' || reason === 'kidney-liver' ? 'circuit' : 'unknown' }
}
