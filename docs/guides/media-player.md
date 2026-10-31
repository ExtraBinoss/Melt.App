# Shared preview player

`components/shared/player/MediaPlayer` owns presentation for local tool playback,
Motion export and Timelapse. A seconds-based presentation source drives the genuine
Radix slider and a fixed-width elapsed/duration clock; per-frame updates do not
rerender the parent surface. Buttons, colors, popover and glass slider use the
shared Melt/shadcn components. Labels live in twelve feature JSON resources.

Pointer and keyboard seeking temporarily pause playback, then restore its previous
playing state. Escape restores the captured position. Ownership changes and
unmount invalidate pending gestures. Seek controls capture editor shortcuts locally.

The optional audio port exposes a local 0–100 monitor level. Its popover supports
mute and restoration of the previous audible level. Tool and Motion previews start
at zero, create no audio context/decoder while muted, and open audio only after an
explicit user gesture. Timelapse and sources without audio show a concise silent
preview indication instead of pretending to provide sound.

`services/motion/audio/PreviewAudio` adapts isolated preview clocks/documents to the
existing `MotionAudioPlayback` worker mixer. It shares authored fades, processing,
source timestamps and bounded PCM scheduling. A native output gain changes monitor
volume smoothly without editing the document, rebuilding the mixer, or changing
export settings. Buffering leases park the visual clock until native audio starts.
Pause, seek, loop, hidden documents, source retirement and disposal stop obsolete
nodes/work; repeated disposal waits for the same cleanup promise. Motion selection
previews retain selected video audio and exclude independent/unselected tracks.

The local tool's clip fields use short labels and put its duration in the player.
Its audio-export switch remains independent of monitor volume. The editor split
Export button resets inherited positional insets inside its inline action group;
the primary action and options button share the same baseline and height.

Playback sliders and timeline markers interpolate only their visible positions;
seeks, loop wraps and direct scrubbing snap to the precise transport value.
Color pickers retain fractional pointer coordinates until RGB/alpha serialization,
with short thumb interpolation and unchanged coarse keyboard increments. Reduced
motion disables these transitions. Glass popovers use a slightly more opaque light
surface; automatic scroll masks reveal that same surface without another white layer.

The current position is editable as seconds or a minutes/hours timecode. Drafts
are not overwritten by playback; Enter or blur seeks once, Escape cancels, and
new owners reject stale edits. The visible thumb center follows the exact rail
endpoints, including paused start/end positions. Sources without audio expose
a disabled volume control and a translated explanation instead of an empty
volume popover; Motion uses an artboard-specific explanation in twelve locales.

Focusing and leaving an unchanged time field never seeks or changes playback.
Only a modified draft commits. The visible duration carries clock metadata;
there is no continuously rewritten offscreen counter. Preview scheduling accepts
a caller-owned UI admission port, which parks GPU jobs during menu entrances
without pausing the audio/transport clock and unsubscribes on disposal.
