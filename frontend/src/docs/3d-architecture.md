# Math Script 3D Architecture

## Production decision

Math Script uses a hybrid renderer:

- React owns authentication, progression, accessible controls, dialogs, saves, and API state.
- React Three Fiber owns the persistent 3D game world.
- The existing simulation remains renderer-independent so WebGL context recovery cannot lose progress.
- Phaser is loaded only when the player explicitly switches to the classic view.

This avoids rewriting the economy while making the gameplay surface genuinely 3D.

## Current implementation

`Tycoon3DWorld.jsx` provides:

- Seven selectable 3D departments with procedural workstations, workers, output piles, and visual upgrade tiers.
- A live elevator and compiler core driven by existing game state.
- Orbit and zoom camera controls with constrained framing.
- Desktop and mobile quality budgets, capped device pixel ratio, adaptive lighting, reduced-motion support, and a no-WebGL fallback.
- DOM controls for keyboard access and screen-reader semantics.
- Lazy loading so Three.js is downloaded only after entering gameplay.

Run `npm run verify:3d` while Vite is available at `http://127.0.0.1:5173`. The verifier checks desktop and mobile canvas dimensions, framebuffer variation, overlay bounds, selection, runtime errors, and screenshots.

## Performance budget

- Sustained 30 FPS on the minimum supported phone; target 60 FPS on current mid-range devices.
- Device pixel ratio between 1 and 1.5.
- Fewer than 200 normal-play draw calls.
- One shadow-casting directional light on desktop; no dynamic shadows on mobile.
- No SSAO, SSR, depth of field, motion blur, or multi-pass bloom on the default mobile tier.
- Repeated future props and characters must use instancing or merged geometry.
- Routine textures should not exceed 2048 square pixels.
- Production models use GLB, Meshopt geometry compression, and KTX2/Basis textures. Decoder assets must be self-hosted.
- Essential actions and state must remain available in DOM controls; canvas pixels are never the only interface.

## Asset pipeline

1. Model modular rooms, machines, and heroes at real-world scale in Blender.
2. Reuse materials and atlases across departments.
3. Export GLB with named animation clips and LOD variants.
4. Optimize with glTF Transform using Meshopt and KTX2.
5. Validate every exported asset with Khronos glTF Validator.
6. Measure decoded GPU memory, draw calls, and a 60-second worst-case camera orbit on real iOS and Android hardware.

Procedural geometry remains the fallback until each production asset passes those checks.

## Migration roadmap

1. Replace procedural department props with optimized GLB assets without changing component contracts.
2. Move dock and compiler presentation fully into the world while retaining the compact DOM command bar.
3. Reuse the renderer foundation for the world map, quests, and battle arena as separate scene modules.
4. Add deterministic visual baselines for each scene and WebGL context-loss recovery coverage.
5. Retire the classic renderer only after telemetry confirms acceptable device coverage and frame pacing.

## Internet research sources

- [React Three Fiber introduction](https://r3f.docs.pmnd.rs/getting-started/introduction): Fiber 9 is the React 19 generation.
- [React Three Fiber Canvas](https://r3f.docs.pmnd.rs/api/canvas): renderer lifecycle, fallback, frameloop, and WebGPU status.
- [Scaling performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance): demand rendering, instancing, LOD, and adaptive DPR.
- [Performance pitfalls](https://r3f.docs.pmnd.rs/advanced/pitfalls): avoid frame-loop React state, repeated mounts, and allocations.
- [R3F events](https://r3f.docs.pmnd.rs/api/events): pointer propagation and capture behavior.
- [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html): Draco, Meshopt, and KTX2 integration.
- [Khronos glTF 2.0](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html): GLB and asset-format requirements.
- [Khronos glTF Validator](https://github.khronos.org/glTF-Validator/): conformance validation.
- [MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices): hardware limits, VRAM budgets, batching, and stalls.
- [Three.js shadows](https://threejs.org/manual/en/shadows.html): render cost of each shadow-casting light.
- [MDN Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events): unified touch, pen, and mouse input.
- [MDN reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion): motion-preference handling.
- [WCAG animation from interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html): suppressing nonessential interaction motion.
- [Playwright screenshots](https://playwright.dev/docs/test-snapshots): repeatable browser visual validation.