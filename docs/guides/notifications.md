# Editor feedback

Studio and Classic share a session-local feedback stack built on the upstream
shadcn/Sonner component. Editor successes, actionable errors and undo/redo feedback
use one queue capped at five entries; the oldest entry is evicted when a sixth
arrives. Sonner's visible-card setting is also five. Queue state and interaction
state use local Jotai atoms; publishing feedback does not subscribe App or canvas
roots to the queue.

Collapsed cards expand on pointer hover and keyboard focus. Alt+T focuses the
stack. All reading timers pause while the stack is hovered or focused; copying
technical diagnostics also holds the addressed card. Successes last four seconds,
errors eight seconds and history feedback two seconds. Each card can be dismissed
independently. Project loads clear the queue, repeated identical renderer failures
are deduplicated, and unmounting removes subscriptions, timers and owned toasts.
Reduced motion follows the shared component and system preference.

Studio places the stack above the scene controls rather than over their buttons.
Classic retains its canvas-centered top placement. Geometry reads are batched
before writes and only update CSS properties on the feedback portal; no inherited
page styles or body locks are changed.

Explicit recenter and 100% reset commands publish a localized confirmation after a
mounted viewport has handled the action. Fit, zoom and automatic viewport framing
do not add notices. This presentation feedback does not edit the document or add
an undo entry. Notification labels and recenter confirmations cover all twelve
supported languages.
