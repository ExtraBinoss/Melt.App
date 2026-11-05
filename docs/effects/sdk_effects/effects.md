# Effects to implement

Every new effect uses the shared SDK metadata, placement, animation and resource
contracts. Do not replace an existing built-in or rename a partial approximation
to suggest a capability it does not possess.

| ID | Required result | Essential controls |
| --- | --- | --- |
| `risograph` | Limited ink printing, independently misregistered ink layers, grain and paper. | Ink palette, registration offset, dot/grain size, print direction and position. |
| `oil-paint` | Painterly region simplification with edge/detail control. | Brush size, direction, detail and blend. |
| `chromatic-aberration` | Standalone RGB separation on arbitrary content. | Center, radial/directional mode, angle, strength and edge falloff. |
| `blocks` | LEGO-like mosaic: source-colored brick tiles, circular raised studs, bevels and shadows. | Brick size, palette/quantization, stud height/radius, gaps, light direction and grid position/angle. |
| `wind` | Directional streak/stretch with controllable animated modulation. | Position, direction, reach, variation, explicit phase and speed. |
| `trail` | Generic controllable echoes of upstream content; temporal motion takes must actually sample previous authored poses. | Samples, delay, fade, transform and direction; static echoes and historical sampling explicitly distinguished. |
| `depth-of-field` | Focus blur based on native scene depth. | Focus distance, aperture/blur bound, focal range, sampling quality and focus point. |

## Blocks reference

The supplied reference represents colored toy bricks, not square image
pixelation. Each retained source cell has a square brick body with a raised round
stud and directional lighting. Empty/transparent source regions remain empty.
Grid position, angle, size and shared application area are editable. Use a bounded
TSL image treatment; creating thousands of independent scene objects is unnecessary.

## Deliberate distinctions

- Existing Halftone and Drop shadow already provide their respective functions;
  migrate them to common capabilities instead of duplicating their effect types.
- Existing Lens/Bokeh blur remains useful for 2D styling. It is not renamed DOF.
  Native DOF declares real depth requirements and mapping, including output framing.
- Existing Window Trails is a specialized graphic treatment. Generic Trail must
  not claim previous-frame history when sampling only the current source image.
- Light Wind's exact external implementation is not specified. Build an authored
  directional wind treatment and document its behavior instead of claiming parity.
- Oil Painter initially uses a bounded Kuwahara-style painterly filter, not a
  simulation of physical oil or an AI-generated replacement.

## Native witnesses

Use a gradient, a transparent calibration grid, a photograph, an editable text
layer and a native foreground/background 3D scene. Validate concrete pixels and
decoded exports, not only metadata or node existence. Test masks, groups, effect
stack order, local/composition scopes, partial opacity and every supported backend.
