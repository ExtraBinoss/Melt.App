# Depth of Field

Depth of Field is a composition-only native-depth gather. It borrows the existing root spatial viewport's depth texture, camera near/far planes and projection kind. Perspective depth is linearized to positive camera distance; orthographic depth uses the camera's linear range. No synthetic luminance depth, radial fallback, extra depth allocation or GPU pixel readback is used.

Manual focus distance and focal range define a sharp camera-space interval. Aperture and maximum blur bound a polygonal gather in authored pixels. Blade count and angle shape the aperture. Quality selects 8, 16 or 24 gather samples, plus the original color and center depth; depth edge protection rejects samples across depth discontinuities. Samples accumulate premultiplied color, while the output retains the original source alpha. Shared application-area controls can restrict the treatment without changing the camera or source image.

Depth and composition color use the exact same cropped viewport, so sampling offsets divide by its logical extent. The shared application field retains the full composition's logical coordinates through the viewport's content rectangle. Manual camera distance is stable across crop, pixel density and export size. Point focus is deliberately absent: an arbitrary full-composition focus point cannot be resolved from an offscreen part of a cropped depth texture.

The catalog offers this effect only on compositions containing a visible native spatial source. The renderer verifies the borrowed depth port and rejects missing depth explicitly. Layer attachments are invalid. Depth follows the existing opaque spatial prepass; transparent spatial surfaces and faded isolation scopes do not gain new depth coverage. Flat 2D overlays are not assigned fabricated camera distances.

The effect operator retains texture bindings and uniforms, but never disposes the borrowed depth texture. Its allocation remains charged to the existing spatial stage budget. Depth-dependent passes skip generic 1×1 warmup until an actual native port is available, avoiding sampler identity deduplication against a dummy color texture.

Native WebGPU/WebGL2 pixels, near/far focus separation, cropped framing, decoded export and resource cleanup remain the batch validation owner's checks. Registration and the TSL graph alone do not establish visual acceptance.
