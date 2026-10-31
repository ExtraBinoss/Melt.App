# Technical stack and choices

Melt is a browser-based creative editor. Projects are stored on the device and can be downloaded as editable `.musart` files. Editing does not require an account or an application backend.

## Application

| Technology                        | Role and reason                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Bun and strict TypeScript         | One workspace toolchain for the app, reusable packages and command-line tools, with shared typed document contracts.     |
| React, TanStack Start and Vite    | Typed routes, server/prerendered landing HTML and client-only editor builds.                                             |
| Jotai                             | Interface state such as selection presentation and open controls; the document engine owns saved edits.                  |
| Tailwind CSS, shadcn/ui and Radix | Shared styling and accessible dialogs, menus, tabs and controls. Copied components retain their provenance and licenses. |
| Motion                            | Interface transitions that respect reduced-motion preferences.                                                           |
| i18next and react-i18next         | Feature-owned JSON resources, an extensible locale registry and English fallback.                                        |

Exact dependency versions are pinned in [package.json](../../package.json) and `bun.lock`. Version numbers across the application and workspaces stay synchronized.

## Localization

i18next owns runtime resources and react-i18next supplies React subscriptions. English is the default and fallback language. Server rendering and the first client render both start in English; the hydrated leaf route then restores a supported saved `musart.language` preference in the shared instance and its React provider. Restoring in the document shell before lazy route HTML hydrates would create a server/client text mismatch. Missing, invalid or inaccessible preferences use English. Changing the language updates the shared i18next instance, document language/direction and saved preference.

`apps/web/src/state/i18n/locales.ts` is the locale registry used by public navigation, editor preferences, onboarding and search. The public site, landing and tools provide English, French, German, Spanish, Italian, Portuguese, Dutch, Polish, Japanese, Korean, Chinese and Arabic. Editor resources currently cover English and French; other locales use the English fallback for untranslated editor namespaces. Arabic sets the document direction to RTL.

Each feature keeps editable JSON resources beside its implementation in `locales/<language>.json`. Multiple catalogs in one feature use descriptive subdirectories, for example `components/properties/effects/locales/gradient/`. The tools retain their categorized `tools/content/<language>.json` resources because SEO metadata also reads English content there. Existing effect-library JSON stays inside each effect's directory. Shared editor catalogs live under `state/i18n/locales/{common,interface-v2,projects}/` and retain their existing public translation keys.

Feature `messages.ts` modules contain only JSON imports/discovery and namespace registration. `localeResources` discovers all JSON languages in that feature with Vite's `import.meta.glob`; feature imports remain lazy, so adding a translation does not make unrelated editor catalogs eager. The helper resolves only `{{brandName}}` and `{{brandNameUpper}}` through the shared brand configuration; ordinary i18next interpolation and plural suffixes remain intact. `registerFeatureTranslations` accepts any language map and preserves registrations made before i18next initialization.

To add a public language, translate the full English schemas in `components/site/locales`, `components/projects/landing/locales` and `tools/content`, retain interpolation variables, then add its code and native/English names to `supportedLocales`. Feature loaders and language selectors discover it without component changes. Additional editor namespaces can be translated incrementally in their owning feature directories. Focused localization regressions check public completeness, matching English/French feature keys, interpolation, supported saved preferences and fallback behavior.

## Rendering

**Three.js WebGPURenderer** owns GPU rendering, **Three.js Shading Language (TSL)** defines effects, and **React Three Fiber** presents the result in the editor. Three's WebGL2 backend provides the fallback when WebGPU cannot initialize. Both backends use the same effect definitions and composition graph.

Images, masks, effects and isolated layer groups remain in GPU textures between passes. The editor renders on demand; a static document does not need a continuous render loop. Parameter gestures preview through stable subscriptions and GPU uniforms, then commit one validated edit and one undo entry when the gesture ends.

The export path uses the same composition graph and browser encoders. Application code does not copy rendered GPU pixels into JavaScript arrays. Resource caches and pending work are bounded and explicitly disposed. See [composition](../rendering/compositing.md), [Three.js integration](../rendering/three-webgpu.md) and [TSL conventions](../rendering/tsl.md) for the implementation contracts.

## Documents and local storage

The reusable document engine is independent of React, browser APIs and GPU objects. It validates edits, handles undo/redo and supplies the same commands to the interface and headless tools. Related commands can be applied as one atomic transaction.

The web app uses **IndexedDB**, through **idb**, for local projects, original assets, fonts and the durable edit journal. Frequently changed document metadata is kept separate from original image bytes and large history records. Workers handle selected persistence and preparation jobs; revision checks prevent stale work from overwriting newer edits.

Portable `.musart` JSON includes the document and its original image assets. Fonts remain separate browser-library resources: custom font files must be installed in each browser/profile that opens the project. There is no built-in cloud synchronization or collaboration service. See [font portability](../guides/fonts.md), [history](history.md) and [storage contracts](../performance/storage.md).

## Text, selection and export

| Technology                                 | Role                                                                                                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| text-shaper                                | Prepare font outlines and text shaping; analytical curve coverage is rendered on the GPU. OpenType.js remains for UI import metadata validation and test references.           |
| Fontsource and the checked-in font catalog | Local interface fonts, bundled editing fonts and metadata for on-demand font downloads.                                                                                        |
| Transformers.js and pinned SlimSAM weights | Optional object selection in a local worker, using WebGPU or a WASM fallback. Model/runtime files download on first preparation; images remain on the device.                  |
| Browser image encoders and fflate          | PNG, WebP and JPEG export, plus ZIP downloads of multiple artboards.                                                                                                           |
| Mediabunny and browser media APIs          | MP4/WebM timelapse encoding, subject to the browser's actual codec support.                                                                                                    |
| Playwright Chromium                        | Browser rendering and screenshots for [headless mode](../guides/headless.md), as well as real-browser verification. Document creation and command application need no browser. |

## Repository map

| Location          | Owns                                                                             |
| ----------------- | -------------------------------------------------------------------------------- |
| `packages/core`   | Portable documents, validation, commands, geometry, history and replay.          |
| `packages/render` | Three.js resources, source preparation, composition, effects, caches and export. |
| `packages/assets` | Shared font, icon, shape and preset catalogs.                                    |
| `apps/web`        | React interface, editor state, canvas integration and browser adapters.          |
| `scripts`         | Headless CLI, release tooling and repository checks.                             |

Vitest covers document behavior and module contracts. Playwright exercises native browser interactions, GPU output and decoded exports. Oxlint, ESLint, Oxfmt and TypeScript provide static checks. The [contribution rules](../../AGENTS.md) define which checks a change requires; the [performance runbooks](../performance/README.md) define measured workloads.

## GitHub Pages

The [Quality workflow](../../.github/workflows/quality.yml) runs `bun run check-ci` before its Pages build and deployment jobs. This checks versions, repository rules, types, lint, formatting, full Vitest coverage, coverage-aware rules and the production build, without installing Chromium or running Playwright. Browser scenarios remain available through `bun run test:browser` and the complete `bun run check` release gate; they do not block automatic Pages publication.

Deployment is restricted to `ExtraBinoss/MusArt`, the `main` branch, and push/manual runs whose original actor and triggering actor are both `ExtraBinoss`. Pull requests and forks run verification without publishing the site.

In repository **Settings → Pages**, select **GitHub Actions** as the source. The workflow deploys through the `github-pages` environment to `https://extrabinoss.github.io/MusArt/`; the URL becomes available after the first successful deployment.

Keep `github-pages` restricted to `main`, with `ExtraBinoss` as its sole required reviewer and administrator bypass disabled. Self-review must remain allowed so the owner can approve their own deployment. The `main` ruleset requires pull requests, owner review, resolved conversations and the `verify` check; its only bypass is the `ExtraBinoss` user. These controls are configured in GitHub settings separately from the workflow and [CODEOWNERS](../../.github/CODEOWNERS) files.

TanStack Start prerenders `/`, `/dashboard`, `/editor` and `/ssr` into `dist/client`. The landing contains real HTML and SEO metadata; the library and GPU editor use a shared client-only layout and are marked `noindex`. The editor accepts `?project=<durable-id>` and landing templates use `?template=<catalogue-id>`. Project selection replaces that transient template query with the saved project ID. Dashboard/editor navigation retains the runtime, undo history and an already mounted canvas; refresh restores the URL target from IndexedDB. The Pages workflow publishes only `dist/client`.

Vite reads `MUSART_BASE_PATH` for the hosted path. The workflow obtains it from GitHub's Pages configuration; local development defaults to `/`. To preview the project path locally:

```sh
MUSART_BASE_PATH=/MusArt/ bun run build
MUSART_BASE_PATH=/MusArt/ bun run preview
```

Open `http://localhost:6100/MusArt/`. Projects and installed fonts belong to the browser origin: data saved on localhost is separate from data on the hosted site. Download a `.musart` file to move a project, and install its custom fonts separately.

## Attribution

The project is MIT licensed. Bundled fonts, models, copied components and artwork retain their own notices. See [sources and licenses](../legal/provenance.md) and [legal/](../legal/).

## Library entry

Try Melt opens `/dashboard` directly on Templates. Templates, Projects and Community share the same library navigation. Initial library startup keeps a private empty draft, does not restore the last document and defers the editor/R3F bundle until editing; pointer/focus intent can preload the lightweight studio module. Favorites are promoted within the normal filtered grids. Missing first-page favorite projects use bounded 24-ID summary reads, without changing the active document. Card menus and right-click share one action list; the destructive action retains its own divider.

## Loading feedback

`components/ui/throbber/Throbber` provides `mascot`, `dots` and `shimmer` presentations. Its optional activity subscription stays local to the status leaf. The 160 ms reveal threshold only suppresses a short visual flash: reads, rendering, errors and ready content are never held for the animation. Completion stops the active animation and allows its decorative tail to fade for 160 ms. The mascot uses the shared SVG engine and original eyes, alternating its face and native thinking dots; reduced motion retains a still face. CSS shimmer is an original implementation, with no code or dependency copied from the account-gated shadcn.io example.

Library Motion surfaces share a hover hint and an accessible native play/pause control outside their card's activation button. Pause retains the displayed GPU texture and stops requesting samples; resume excludes paused wall time. Leaving the surface releases the preview normally. Frame updates and control labels use local imperative updates rather than gallery-wide React renders.
