# Dependency maintenance

Checked on 2026-11-01 against the npm registry's stable `latest` tag across every
Bun workspace. All direct runtime and development packages below match their
published stable version. Workspace links keep the synchronized project version
0.2.0. Transitive packages were refreshed within their parents' supported ranges;
forcing unrelated transitive major versions would violate those contracts.
`bun outdated --recursive` reports no outdated packages. Registry witnesses are
retained in `artifacts/dependencies/`.

Bun is pinned to 1.4.4 in `packageManager` and both CI installation steps. The
update/install witness uses that version through Bun's cached executable; it
does not replace a shared workstation's global executable.

## Compiler compatibility

The typecheck executable is TypeScript 7.0.2, installed as `@typescript/native`.
TypeScript 7 does not provide a JavaScript compiler API. The `typescript` package
name therefore aliases Microsoft's latest `@typescript/typescript6` 6.0.2 for
ESLint, rules, metrics and instrumentation. Its CLI is `tsc6`, leaving `tsc`
owned by TypeScript 7. This is the official side-by-side setup, not an outdated
production compiler. [Microsoft's migration guidance](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6-0).

## Patches and rendering

Mediabunny 1.65.0 is unmodified. Its 1.63.0 Matroska duration fix replaces our
obsolete patch; shortened final samples remain covered by actual file decoding.
The latest text-shaper 0.1.28 and Radix Menu 2.2.1 still require their existing
patches; see [patch provenance](../../patches/README.md).

Three r187 replaces atlas PMREMs with six-face cubes and clamps their face
resolution to 256px. Reflection quality still controls probe count, admitted
geometry and refresh cadence. Cache accounting now includes every face and
explicit radiance mip. A conservative source/depth scratch reservation keeps
its high-water size until generator disposal. Composition-owned sampled lights
use the public subclass `registerNode` API, preserving exact per-render color
and intensity without replacing Three's standard light classes.
[Three's migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide#186--187).

## Stable package inventory

| Package                                | Installed stable version |
| -------------------------------------- | ------------------------ |
| `@fontsource-variable/inter`           | 5.3.0                    |
| `@fontsource-variable/space-grotesk`   | 5.3.0                    |
| `@huggingface/transformers`            | 4.3.2                    |
| `@imagemagick/magick-wasm`             | 0.0.45                   |
| `@playwright/test`                     | 1.64.1                   |
| `@radix-ui/react-roving-focus`         | 1.2.1                    |
| `@react-three/fiber`                   | 9.8.2                    |
| `@tailwindcss/vite`                    | 4.3.3                    |
| `@tanstack/react-router`               | 1.170.46                 |
| `@tanstack/react-start`                | 1.169.4                  |
| `@testing-library/jest-dom`            | 7.0.1                    |
| `@testing-library/react`               | 16.3.3                   |
| `@testing-library/user-event`          | 14.6.8                   |
| `@types/bun`                           | 1.4.4                    |
| `@types/clipper-lib`                   | 6.4.0                    |
| `@types/node`                          | 26.6.6                   |
| `@types/opentype.js`                   | 1.3.10                   |
| `@types/rbush`                         | 4.0.0                    |
| `@types/react`                         | 19.3.0                   |
| `@types/react-dom`                     | 19.3.0                   |
| `@types/three`                         | 0.187.0                  |
| `@typescript/native → typescript`      | 7.0.2                    |
| `@vitejs/plugin-react`                 | 6.1.2                    |
| `@vitest/coverage-v8`                  | 5.0.5                    |
| `@webgpu/types`                        | 0.1.74                   |
| `class-variance-authority`             | 0.7.1                    |
| `clipper-lib`                          | 6.4.2                    |
| `clsx`                                 | 2.1.1                    |
| `cmdk`                                 | 1.1.1                    |
| `eslint`                               | 10.14.0                  |
| `eslint-plugin-react-hooks`            | 7.1.1                    |
| `fake-indexeddb`                       | 6.2.7                    |
| `fflate`                               | 0.8.3                    |
| `flatbush`                             | 4.7.0                    |
| `i18next`                              | 26.6.0                   |
| `idb`                                  | 8.0.4                    |
| `jotai`                                | 3.0.1                    |
| `jsdom`                                | 30.1.3                   |
| `lucide-react`                         | 1.66.0                   |
| `magic-string`                         | 1.4.5                    |
| `mediabunny`                           | 1.65.0                   |
| `motion`                               | 14.9.0                   |
| `opentype.js`                          | 2.0.0                    |
| `oxfmt`                                | 0.75.0                   |
| `oxlint`                               | 1.90.0                   |
| `oxlint-tsgolint`                      | 7.0.2005                 |
| `radix-ui`                             | 1.8.1                    |
| `rbush`                                | 4.0.1                    |
| `react`                                | 19.3.1                   |
| `react-colorful`                       | 5.8.1                    |
| `react-dom`                            | 19.3.1                   |
| `react-i18next`                        | 17.1.10                  |
| `react-resizable-panels`               | 4.16.1                   |
| `shadcn`                               | 4.23.0                   |
| `svg-pathdata`                         | 9.0.0                    |
| `tailwind-merge`                       | 3.7.0                    |
| `tailwindcss`                          | 4.3.3                    |
| `text-shaper`                          | 0.1.28                   |
| `three`                                | 0.187.0                  |
| `tw-animate-css`                       | 1.4.0                    |
| `typescript → @typescript/typescript6` | 6.0.2                    |
| `typescript-eslint`                    | 8.72.1                   |
| `vite`                                 | 8.3.5                    |
| `vitest`                               | 5.0.5                    |

Use `bun update --latest --recursive --exact` to refresh all workspace manifests
and their compatible transitive dependencies. Review retained patches and native
exports before delivery. [Bun update contract](https://bun.com/docs/pm/cli/update).

## Verification

Focused regressions cover the new cube/mip budget, reflection admission and
cleanup, sampled light scheduling, real font cache/positioning witnesses,
encoder backpressure, menus, timeline fixtures and TypeScript-powered rules and
metrics. Nine native Chrome scenarios on Linux (one Playwright worker, low CPU priority,
Vulkan/SwiftShader available) exercise WebGPU and WebGL lighting/reflections,
50-image effect stacks, legacy timelapse recovery and copyable diagnostics, and
the desktop/phone library. Exported WebM video ends exactly at 0.370 seconds
including its 3ms final video sample; the native Opus track ends at 0.373 seconds,
within its 20ms final codec packet. This is explicitly measured padding, not a
relaxed video timing assertion. No production readback probe fired. Reports
and captures are under `artifacts/dependencies/native/`.

The editor display adapter explicitly resets the renderer target to the canvas
before each Fiber display draw. Offscreen composition can otherwise leave a
prepared frame hidden indefinitely because it is never acknowledged as visible.
The native `studio-open-project` case verifies the full dashboard-to-editor
path and actual visible presentation before background video conversion starts.
Canvas startup logs distinguish preparation from visible presentation; one
bounded eight-second warning includes actual pending diagnostics. Real failures
retain their original error in the console. Completion and disposal clear the
watchdog. No pixel readbacks or frame-driven React updates were added.

After dependency peer links change, `bunx vitest --clearCache` retires old cached
absolute runner imports. The frozen Bun installation is unchanged by that cache
cleanup; fresh tests use the pinned installed Vitest.
