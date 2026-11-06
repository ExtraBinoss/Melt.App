# Deterministic Trail history

Temporal Trail is available on individual layers, groups and the composition.
At a Motion sample it requests up to eight exact previous rational timestamps,
using the same immutable Motion program as preview, replay and video export.
Delay controls the timestamp spacing; samples before time zero are absent.
A static composition has no authored past, so temporal mode produces no invented
history. Offset mode remains a separate current-source graphic treatment.

Each historical capture truncates the requesting owner's stack immediately before
Trail. Other temporal Trail operators are excluded to prevent recursion; ordinary
offset Trail treatments remain upstream. The full historical scene, including
camera, parent transforms, lighting and neighbours, is retained for native depth,
shadows, reflections and mask dependencies. A layer capture isolates paint to its
own subtree while retaining that native scene context. Ancestor paint treatments
are applied by the current composition traversal after the owner's Trail.
Historical owner masks are captured; the current owner's final mask still clips
the completed treatment according to ordinary effect-stack semantics.

Snapshots use composition coordinates. Each current effect plane supplies an
explicit homography into the historical capture rectangle, independently of
texture resolution and viewport density. Historical bounds extend the current
transport so past positions can remain visible outside the present source box.
A zoom change cannot move the historical pose. Native objects retain their actual
historical camera and scene pose; snapshots never transform a copy of the current
raster to approximate earlier motion.

Storage is bounded to 32 snapshots shared across active owners. The child
compositor and snapshot pool are each capped at one quarter of the parent budget,
up to 64 MiB each, and admitted against the parent GPU cache. Captures retain the
requested density when it fits; device dimensions and admitted bytes otherwise
reduce sampling density without changing authored coordinates. Invalid budgets
and unsupported resource demand fail visibly. The snapshots remain GPU textures;
there are no production pixel readbacks or persistent framebuffer history.
Aborted or superseded samples cannot publish captures, and disposal releases the
child compositor, copy passes, snapshot textures and external reservation.

Prepared regressions cover rational scheduling, owner isolation plans, unchanged
native scene context, historical owner/parent/camera values, bounded raster sizes,
projective shader dependencies, cancellation and cleanup. These CPU/graph checks
do not establish native pixel correctness; native interaction and decoded export
witnesses belong to the integrated browser verification batch.
