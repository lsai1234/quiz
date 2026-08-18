<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Styling

Read `DESIGN.md` before styling anything outside the quiz flow, and build from
`@/components/system` rather than hand-rolling controls. The short version: every
design value comes from a token, glass goes on nav and modals only, and small
text has a contrast floor that is easy to break and invisible when you do. Both
rules are enforced by tests.

Review changes at `/styleguide`. The remaining rollout, in phases, is
`docs/DESIGN_ROLLOUT.md`.
