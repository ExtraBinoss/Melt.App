# Human and agent collaboration

## Scope

Multiple people and agents may eventually edit the same cloud project. Start
with an explicit room per project and bounded active state. Room transport and
coordination are adapters; they must preserve the engine and cloud repository
contracts. A room is not necessarily a process, container or permanently loaded
document per customer.

The existing local editor/agent bridge supplies useful revision and transaction
semantics. It is not currently a multi-user collaboration implementation.

## Transport responsibilities

| Information                                             | Transport and authority                                                          |
| ------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Authentication, invitations, membership and permissions | Authoritative application API; WebSocket subscriptions where needed.             |
| Completed commands and transaction acknowledgments      | Authoritative server path, normally WebSocket for live collaboration.            |
| Reconnect state and committed revision catch-up         | Durable server state with bounded pages/checkpoints.                             |
| Cursor, transient selection and tool presence           | Prefer WebRTC DataChannel between participants.                                  |
| Temporary drag/parameter preview                        | Prefer WebRTC; never a durable change solely because a peer received it.         |
| Images, videos and models                               | Asset uploads/downloads through storage; document messages carry references.     |
| Optional voice/video/screenshare                        | Separate WebRTC media feature and cost budget; not required for canvas presence. |

WebRTC presence uses small coordinate/property messages. Every participant renders
the scene and cursors locally; normal canvas collaboration does not stream a
video of the entire canvas. Use change-only transmission and a bounded cadence,
with local interpolation for smooth movement. Drop stale preview packets instead
of queuing obsolete positions. Exact rates remain to be measured.

One completed gesture creates one authoritative transaction and one local undo
unit. Long gestures may need sparse recovery checkpoints. Do not persist a
document snapshot or history entry for every pointer event.

## STUN, TURN and fallback

The desired path is a direct browser-to-browser connection. Signaling exchanges
connection information through an authenticated service, and STUN helps discover
reachable addresses. This does not guarantee direct connectivity on every network.

TURN is a relay when a usable direct path is unavailable. If a TURN path is
selected, application traffic travels through it for as long as that path is
used; TURN is not merely the initial handshake. The browser handles negotiation,
but Melt must supply relay configuration/credentials and account for relay costs.

Evaluate two fallback choices before release:

1. Managed or self-hosted TURN, with short-lived scoped credentials and measured
   relay bytes; allow direct paths rather than forcing relay-only operation.
2. Route transient messages through the existing WebSocket when direct WebRTC
   fails, avoiding a mandatory TURN service for the first release.

The user preference is direct WebRTC where possible, with STUN and potentially
TURN as fallback. The final fallback policy/provider is not selected. Neither
choice changes where committed document authority lives.

A full peer mesh multiplies connections and per-recipient traffic as teams grow.
Define a supported room size and fallback strategy; a small-team approach must
not be presented as arbitrary-scale conferencing. Agents can use MCP/server
events without maintaining a visual WebRTC peer when unnecessary.

## Concurrent edits and reconnects

Assign every durable operation an actor, stable ID, expected revision, target
identities and authoritative sequence. Persist idempotency results across
reconnects; a timeout cannot authorize blind replay of a completed write.

Start by rejecting stale commands with a structured conflict and current revision.
The current whole-project revision guard protects state but does not merge edits.
Later, explicitly define safe handling of independent properties, conflicting
transforms and structural operations. Re-executing every stale absolute command
against a newer document is not a valid merge policy.

Keep local optimistic drafts, previews and durable acknowledgments distinct.
Server rejection must reconcile a draft without overwriting another actor's work.
Reconnection needs a bounded catch-up or checkpoint path and clear treatment of
unacknowledged operations. Room ownership must survive a process restart, and
multiple replicas need explicit room routing/coordination.

Optional object/field leases can reduce competing gestures but need expiry and
disconnect cleanup. They do not replace durable revision validation. Stop relaying
presence when access is revoked and clear departed participants' transient state.

## Undo, Yjs and implementation language

The current global snapshot undo stack cannot become shared multi-user undo
unchanged. Define actor-scoped undo or another explicit conflict-aware policy.
Undoing one person's transaction must not silently revert a teammate's later edit.

Yjs is a candidate for simultaneous text editing or a later offline collaboration
model. It is not selected as the representation of the whole project. Binding it
to Melt still requires domain validation, permissions, history policy and bounded
document lifetimes. Arbitrary peer updates must not bypass engine invariants.

Hono handles HTTP/routing concerns; it does not eliminate CRDT state or history
memory. Switching the room server to Rust alone does not bound an unbounded
document. Prefer TypeScript reuse initially, external asset references, lazy
loading, snapshots and deliberate cache eviction.
