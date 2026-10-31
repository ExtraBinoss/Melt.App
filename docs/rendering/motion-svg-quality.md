# Motion SVG edge coverage

The supplied six-second video is already 1920 × 1080 at 30fps, AVC/H.264 High,
YUV 4:2:0, with approximately 1.62Mb/s average encoded bitrate. Average bitrate
does not reveal the user's requested variable-bitrate target. Extracted frames
show rough mascot/lettering contours; their portable layer types cannot be
recovered from the encoded video alone.

The editor requested direct SVG multisample coverage, while Motion's renderer
consumer and preview omitted that option. Motion now requests the same existing
four-sample SVG target on both Three backends. Geometry/cache identities, budget
accounting and disposal use the existing renderer. Fixed effect/mask references
retain authored pixels, and analytical native text keeps its existing curve
coverage. No document schema, output dimensions, video bitrate or codec defaults
change. AVC remains lossy and can still soften fine colored edges.

The native regression uses the real brand SVG, a colored diagonal and actual
Inter text rendered through the production SDK, then encodes and decodes an MP4.
It compares decoded mascot edge pixels with same-resolution aliased and antialiased
PNG witnesses. Inspection reads happen in a separate test page; production GPU,
WebGL, Canvas2D and VideoFrame readback probes remain zero. Both renderers are
created/disposed serially and the video sample/decoder is closed.

| Measurement                                       | Before (WebGPU) | After (WebGPU) | After (WebGL) |
| ------------------------------------------------- | --------------- | -------------- | ------------- |
| SVG edge pixels sampled                           | 793             | 793            | 780           |
| RMSE against antialiased reference, 8-bit channel | 90.08           | 5.50           | 5.36          |
| Native text edge RMSE, 8-bit channel              | 4.97            | 4.97           | 4.97          |

Before the fix, decoded edges instead track the aliased witness (RMSE 14.13);
afterward they track the antialiased witness. The native text check prevents
blank frames, clipping or a decoder mismatch from masquerading as smoother SVGs.
The fixture contains one authored, active 30fps frame and uses validated engine
commands to initialize its Motion clips. These are controlled rendering/encoding
checks, not a reconstruction of the user's complete original project.

Raw MP4s, PNG witnesses and reports are retained under ignored
`artifacts/svg-export/`. The sample's extracted frames remain there locally and
are not published with the source. Run `test/browser/svg-video-quality.spec.ts`
against the frozen production server with one native browser worker. Browser,
viewport and process limits match the adjacent canvas cohort: Linux / Chromium
156.0.8078.4, Intel Xe-LPG WebGPU, 1600 × 1000, DPR 1, CPUQuota=100%,
MemoryHigh=1700M, MemoryMax=2400M, MemorySwapMax=0. The WebGL case forces Three's
fallback and validates the same decoded-output contract.
