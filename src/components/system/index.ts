/**
 * The primitive layer.
 *
 * Every component here consumes tokens and nothing else — no hex, no rgba, no
 * literal px, no Tailwind colour, type, radius or spacing utility. That is not a
 * style preference; it is what makes the system a system, and
 * `src/components/system/__tests__/tokens-only.test.ts` enforces it on the
 * source so the rule survives the next convenient copy-paste.
 *
 * Reviewed together at `/styleguide`. Documented in `DESIGN.md`.
 *
 * `@/components/ui` is the layer this replaces. Both exist during the migration;
 * the old one is deleted as the last hub lands. The one thing imported across
 * that line is `Icon`, which is a drawn glyph set rather than a styled
 * component — it renders in `currentColor` and has no design values of its own.
 */

export { Ground } from './Ground'
export { Button, type ButtonProps } from './Button'
export { Card, type CardProps } from './Card'
export { Input, type InputProps } from './Input'
export { Select, type SelectProps } from './Select'
export { Modal, ModalHeader, ModalBody, ModalFooter, type ModalProps } from './Modal'
export { Badge, type BadgeProps } from './Badge'
export { Tabs, type Tab, type TabsProps } from './Tabs'
