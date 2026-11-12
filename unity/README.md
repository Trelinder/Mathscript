# Mathscript Unity Tycoon Prototype

## Gameplay Parity Status

Full commercial Idle Miner Tycoon parity is **not implemented or certified**.
The selected Miniplay/Madkid browser reference declares product version 2.55.0;
that declaration does not identify or cover the full commercial mobile game.
REA is an inspection tool, not the Unity builder. Existing `PARITY` pass markers
check internal Mathscript rules and regressions, not complete reference equivalence.

| Surface | Verified Status |
| --- | --- |
| Fresh opening | Reference shows 10 cash and an unbuilt first shaft costing 10. New Mathscript companies now use that paid opening and recommend construction. |
| First upgrade | The reference level-one statistics panel prices the first upgrade at 11. Mathscript now charges exactly 11; unaffordable, combined construction, mouse purchase and reload checks pass. |
| Second construction | The shared playable reference displays New Shaft for 1K. Mathscript now charges 1,000 for its second department; later construction prices and upgrade curves remain unverified against the reference. |
| Bulk purchase modes | Reference screenshots show x1, x10, x50 and Max. All four modes are implemented; Mathscript exact pricing, affordability and one-time mouse/touch purchases pass. Reference cost curves remain unverified. |
| Existing companies | Saved balances, built departments, progression and refactor rules are preserved, not replaced by a new-game grant. |
| Fixed composition | Existing 1280x720 letterboxing retained. The earlier bulk native candidate passed five sizes; the latest price-corrected native player stalls at Metal startup. |
| Production and transport | Mathscript manual generation, independent automation and conserved cargo pass tests; reference yields and job timings remain unknown. |
| Managers and upgrades | Mathscript hiring, skills and sequential upgrades exist; commercial manager types, exact effects, cost curves and later expansion are not compared. |
| Offline and prestige | Mathscript save recovery, capped simulation and refactoring pass tests; corresponding commercial rules remain unverified. |
| Late-game content | Full mine/continent progression, events, boosts, shop and account services are not mapped or implemented to reference parity. |

### Current Browser Build

Verified preview: `http://127.0.0.1:52929/`, served from
`Builds/WebGL-Reference-FirstUpgrade-Repair1-20261016` (17,718,413 bytes).
This is a local candidate, not a production deployment or full parity release.
The first upgrade alone is corrected to the observed 11-coin price; later cost
formulas, rates, saved balances and version-3 fields are not replaced.

`MathscriptParityChecks.CheckReferenceFirstUpgrade` failed on the old price and
passes after the repair. It rejects ten coins, charges eleven exactly, rejects
twenty coins for combined construction/upgrade, charges twenty-one exactly and
checks the full x50 total of 66,432. Existing presentation and native/WebGL build
gates also pass. The native interaction fixture now expects the $11 button.

| Final Browser Gate | Observed Result |
| --- | --- |
| Load, idle and input | Frame loop advanced 193 frames; no exceptions, crashes or console errors. |
| Mouse first upgrade | Controlled 1280x800 viewport; eleven coins to zero, level 1 to 2; skipped bonus awards zero and cannot replay after reload. |
| Unaffordable touch x50 | 66,431 coins leaves the full-quantity control disabled; physical touch changes neither cash nor level. |
| Exact-funded HiDPI touch x50 | CSS 390x844 at DPR2, framebuffer 585x1266; 66,432 coins to zero, level 1 to 51; all three skipped bonuses award zero. |
| Touch reload and cleanup | Level 51, zero cash and skipped bonuses survive reload once. The disposable save is then restored to ten coins, seven unbuilt departments and no completed bonuses. Device emulation and navigation backup are cleared. |

An uncontrolled integrated-browser viewport delivered a requested mouse point
at different coordinates. A fixed test viewport restored correct input; no
game code was changed for this probe artifact. Purchase assertions name exact
money/level consequences rather than treating error-free loading as gameplay proof.

Native candidate:
`Builds/macOS-Candidate-Reference-FirstUpgrade-Repair1-20261016/Mathscript Underground Data Center.app`.
Its build passes, but rendered runtime acceptance is **blocked**: ordinary,
explicit-window-size and `-force-gfx-direct` runs do not reach the final
`MATHSCRIPT_IDLE_RUNTIME_PASS` marker. A one-second thread sample of the first
run places the main thread in Metal's last-presentation semaphore wait, before
gameplay markers. The single-thread diagnostic confirms direct rendering but
still stalls. This does not establish the platform root cause or native
playability; no graphics settings were changed and all owned stalled players
were terminated. The earlier accepted bulk candidate does not certify this build.

Logs: `/tmp/mathscript-first-upgrade-{before,after,presentation}.log`,
`/tmp/mathscript-first-upgrade-{native-repair1-build,native-repair1-smoke,native-direct-smoke,webgl-repair1-build}.log`.
Sample: `/tmp/mathscript-first-upgrade-native-startup.sample.txt`.

Further REA MCP capture recovered the reference by dismissing only a verified
advertisement Close, then closing Boosts without entering its shop. Level-19
statistics evidence is
`ev_c79c0509ad94b762efd7e2fbc77198085073b70823de905f93be4acf3b491295`:
next upgrade 167, extraction 35.3/s, two miners, walking speed 2, mining speed
27/s, capacity 111 and next boost at level 25. An active timed x2 boost is
visible in this scene; baseline throughput is not inferred. In particular,
Mathscript's retained level-19 price is 114, not the observed 167: later price
parity is not implemented, and isolated screenshots do not establish its curve.
Evidence and digest-checked screenshots remain in
`/tmp/mathscript-reference-parity-audit/finish-{current-state,ad-close,close-boosts,shaft-stats}-*`.
The owned reference browser was closed; no extension, account or shop action
was taken. Advisory safe-dismissal routing used TypeSafe Jev `jev-1.14.0`,
645 input / 50 output tokens, 250 ms API latency. It is not parity proof.

`MathscriptEconomy.CreateCompany()` supplies 10 coins and no built departments
only for missing saves and fresh runtime startup. Construction costs 10 once;
production cannot run before commissioning. This supersedes the historical
1,000-coin fresh opening below, not existing saves or refactor behavior.
Tests cover unaffordable/sequential construction, exact bulk prices, recommendation,
fresh-save reload and preservation of existing companies.

2026-10-16 candidate verification: native build and actual Metal smoke exited 0,
including the new construction control and existing motion, teaching, contracts,
progression and five-size layout tests. Candidate:
`Builds/macOS-Candidate-GameplayParity-Opening-Repair1-20261016/Mathscript Underground Data Center.app`.
WebGL: `Builds/WebGL-GameplayParity-Opening-20261016`, build exit 0.
Isolated Playwright desktop and DPR2 touch journeys bought the department, generated
7.5 RC, delivered it, compiled 3 RC for 6 coins, conserved the remaining 4.5 RC and
preserved the result after reload. Letterbox input was inert; both had zero exceptions.
Logs: `/tmp/mathscript-gameplay-opening-repair1-{build,smoke}-20261016.log`,
`/tmp/mathscript-gameplay-opening-webgl-20261016.log` and
`/tmp/mathscript-gameplay-opening-browser-20261016.json`.

Reference evidence: `/tmp/mathscript-rea-mechanics-20261016-m0EczW/` retains the
opening audit. `/tmp/mathscript-reference-ready-purchase-rea-20261016.json`
is REA CDP provider v2 evidence `ev_62320ef6887d3a3179fe78507076c60d0750cb4d107782ee03644b5775f0bb5f`.
Its complete-within-window screenshot does not establish successful production
or later gameplay. Initialization, iframe and loading/interstitial states limited
the playthrough; local Vision OCR was used separately to reject loading screens.
Advisory priority ranking used TypeSafe Jev `jev-1.14.0`: 774 input / 55 output
tokens; API latency was not returned in the handoff. Ranking is not parity evidence.

Remaining blocker: select the actual commercial reference build/version, with a
local APK/IPA or an uninterrupted playable reference and complete gameplay scope.
Every remaining system needs reference-grounded rules and state transitions before
implementation and native/WebGL regression proof. Unknown rows cannot be marked
complete; no proprietary artwork/code or external accounts were copied or accessed.

### Continuation Verification

The second department's construction price is separate from its existing upgrade
curve. Unaffordable construction and bulk purchases are atomic; the regression
failed on the old 50-coin price and passed after the correction. Existing balances,
built departments and save schemas are unchanged. The following upgrade still costs
58 coins; that upgrade curve is retained Mathscript behavior, not verified parity.

The initial construction-only candidates passed their build gates. That native rendered
`-idleMinerSmoke` journey passed teaching, progression, contracts, interactions
and motion, then failed with `Resize layout fixture changed game state: (1280, 800)`.
Its final `MATHSCRIPT_IDLE_RUNTIME_PASS` marker was absent, so that candidate did
not pass native runtime acceptance, regardless of the terminal wrapper's exit status.
The latest candidate below passes the strict completion gate. A diagnostic now
checks fixture restoration before resizing; the earlier failure was not reproduced
and its root cause remains unverified. No resize-economy repair is claimed.
The rebuilt browser displayed the disabled
`$1,000` second-department control with 10 cash. A real mouse purchase commissioned
the first department for exactly 10 coins. Candidates:
`Builds/WebGL-Reference-Construction-20261016` and
`Builds/macOS-Candidate-Reference-Construction-20261016/Mathscript Underground Data Center.app`.
Logs are `/tmp/mathscript-reference-construction-{before,after,regression,webgl,native,native-smoke}.log`.

REA CLI `capture_browser_scenario` returned Evidence
`ev_878ecb84fba0a8672541f325c796bde0c0459bc6cf7ec189966c485a977931f5`
using provider `rea-playwright-browser-scenario`, version 1, Chromium 154.0.8037.58.
The isolated screenshot showed reference version 2.55.0 at 35% loading, not playable
later mechanics. Capture completion does not establish gameplay or full parity.
Evidence is `/tmp/mathscript-rea-reference-screenshot-only.json`; the verified PNG
is `/tmp/mathscript-rea-reference-observation.png`. The owned browser was terminated
by the provider. The earlier DOM/accessibility capture stalled and was cancelled.

Continuation routing used advisory TypeSafe Jev `jev-1.14.0`: 563 input / 53 output
tokens and 280 ms API latency. This judgment selected reference inspection; it is
not authorization or executable parity evidence. Full parity remains incomplete.

### Bulk Candidate Verification

The x50 mode now shares the economy's exact bulk quote instead of duplicating
pricing in the UI. Fixed quantities display their complete required price even
when unaffordable; Max quotes only affordable levels. The presentation regression
rejects a purchase one coin short and buys exactly fifty levels at the full price.
Construction, progression, transport, teaching, contracts and save gates pass.

Earlier verified bulk native build:
`Builds/macOS-Candidate-Parity-Bulk-20261016/Mathscript Underground Data Center.app`.
Earlier bulk WebGL build: `Builds/WebGL-Parity-Bulk-20261016`.
These results precede the first-upgrade correction; the preview now serves the
current browser build described above. This is not a production publication.
The native rendered smoke reaches `MATHSCRIPT_IDLE_RUNTIME_PASS`, including five
fixed-composition viewport checks with company, floor-x50 and compiler dialogs.
WebGL build output is 17,718,346 bytes; load/idle/input smoke reports no errors.

| Browser Fixture | Observed Result |
| --- | --- |
| Mouse x50 purchase | Level 1 to 51, exact price 66,431; cash 1,000,000,000 to 999,933,569. |
| HiDPI touch x50 purchase | CSS 390x844 at DPR2, Unity framebuffer 585x1266; level 51 to 101, exact price 71,958,119; cash 999,933,569 to 927,975,450. |
| Reload and bonuses | Both purchases persist once; skipped bonuses grant no cash and do not replay. |
| Cleanup | Only the disposable preview-origin save was funded. It is restored to 10 cash and seven unbuilt departments; touch emulation is disabled. |

The touch harness holds contact for 80 ms so Unity can observe both input phases.
Immediate touch-start/end dispatch did not open the dialog; this was a probe
artifact, not an economy failure or a game-code repair. Physical phone hardware
and Safari remain untested. Focused logs are
`/tmp/mathscript-parity-bulk-regression.log`,
`/tmp/mathscript-parity-x50-after.log`,
`/tmp/mathscript-parity-bulk-native-smoke.log` and
`/tmp/mathscript-parity-bulk-webgl-build.log`.

### REA Runtime Evidence

Actual REA 6.5.0 MCP `list_browser_targets` and `capture_web_screenshot` calls
ran through a local stdio client without changing VS Code registration or permissions.
REA CDP browser provider v2 retained authenticated screenshot evidence:

| Observation | Evidence ID |
| --- | --- |
| Loaded reference opening | `ev_dc54e0ba276c9f375855ef189cd625e8cfdb70fb514b6f1c0563685629ac06ab` |
| First construction | `ev_ddc7d2bc8718bb147521077565e2b13a11068524e24d2c675b9092b9b80163d7` |
| Level-one shaft statistics and x1/x10/x50/Max | `ev_5b0c7909937ddaa6bf3277e3faeb87dab7df8397da8def9b5fd5cac8f4d0c018` |

The statistics screenshot shows extraction 3.33/s, one miner, walking speed 2,
mining speed 5/s, capacity 20 and next boost at level 10. These are observed
reference values, not a verified or implemented full formula. Playwright executed
physical canvas input separately; Apple Vision OCR identified exact ad Close text
separately. Neither is presented as REA gameplay interpretation.
Artifacts are under `/tmp/mathscript-reference-parity-audit/`.

Interstitials and changing canvas state interrupted the reference journey.
Later cash, manager and level changes cannot be causally attributed to a lift
trip. Inspection stopped on a Boosts/store prompt; no shop purchase or external
account action was completed. Advisory routing for that ambiguity used TypeSafe
Jev `jev-1.14.0`: 671 input / 61 output tokens, 564 ms API latency.
Exact reference cost/rate/timing curves, manager effects, later expansion,
barriers, boosts, events, shop and accounts remain unverified. The working
Mathscript candidate must not be described as full commercial parity.

## Fixed Landscape Viewport

Native and WebGL source share one 1280x720 logical game composition (16:9). The world and
UI scale uniformly by `min(viewportWidth/1280, viewportHeight/720)` and center
inside dark letterbox margins. Portrait, short, tall and wide windows retain the
same departments, camera projection, hardware/hero proportions, HUD, controls
and dialog layout. There is no portrait reflow or independent room compression.
Three department slots remain, with two departments at the final depth as before.
Navigation, transport, income, authored teaching feedback and v3 saves are unchanged.
This section supersedes historical responsive/portrait notes below.

UI Toolkit keeps panel/layout scale at 1 and uniformly transforms the finished
logical root; the camera uses the same content rectangle. Fixed numeric and
upgrade-row slots prevent font measurements from moving neighboring controls.
Browser control/readout/dialog bounds stay in Unity
framebuffer pixels with a top-left origin, including margins and scale. Browser
clients convert them through the canvas client rectangle and snapshot width/height
for CSS mouse/touch coordinates. The canvas fills the viewport; Unity supplies
letterboxing on both native and web, rather than a browser-only CSS workaround.

`Mathscript3DOnlyChecks.Run` checks 1280x800, 390x844, 844x390, 1920x800 and
800x1280 at four depths: content bounds, input round-trips, panel settings, unit
architecture and invariant camera position, rotation, zoom and projection.
Expected content is 1280x720 at (0,40), 390x219.375 at (0,312.3125),
693.333333x390 at (75.333333,0), 1422.222222x800 at (248.888889,0), and
800x450 at (0,415), respectively. `-idleMinerSmoke` compares identical economy
fixtures during resize, then resumes live motion. It also checks panel picking,
company/compiler dialogs, margin input rejection and department visibility.
These are not physical input gestures.

2026-10-16 verification: editor and build gates passed. Actual Metal native
smoke exited 0, including all five resize fixtures, unchanged logical geometry,
dialog picking, margin rejection and the existing gameplay/teaching/save gates.
Verified native candidate:
`Builds/macOS-Candidate-Fixed16x9-Compact-20261016/Mathscript Underground Data Center.app`.
Verified WebGL output: `Builds/WebGL-Fixed16x9-Final-20261016`.
Logs: `/tmp/mathscript-fixed16x9-compact-{build,smoke}.log` and
`/tmp/mathscript-fixed16x9-final-webgl-build.log`.
Playwright checked same-page resizing at all five sizes, nonblank world pixels,
unchanged economy, real wide-window mouse input and emulated HiDPI touch input.
Touch generation/transport/compilation, lesson rewards and reload-without-replay
passed. REA retained phone and wide-window screenshots against the selected
Idle Miner browser reference. Actual Safari/iOS and Android hardware remain
unverified; this is not a claim of complete commercial-game parity.
Portrait displays intentionally have small controls because the whole landscape
composition is scaled; rotating the device increases the usable content size.

### Repair Evidence

```yaml
patch_id: fixed16x9-20261016
root_cause_hypothesis: fractional panel scaling and intrinsic text widths changed layout measurements during resize
violated_invariant: fixed 1280x720 composition; each corresponding edge differs by at most one physical pixel after resize
fail_to_pass: repair-5 failed phone compiler geometry; the Compact native candidate passed all five geometry and dialog fixtures
pass_to_pass: existing economy, idle-loop, contracts, heroes, motion, teaching and v3 reload gates passed
adversarial_cases: same-loaded-game resize, native dialog picking, wide mouse, DPR3 touch and unchanged economy
cross_configuration: native and Chromium five-size layouts; portrait/landscape touch and persisted lessons
performance_impact: not benchmarked; no rendering subsystem or dependency added
fix_shape: 1x layout with uniform root transform and stable text slots; exact picking retained and tolerance expressed in physical pixels
inverse_test: native and browser letterbox input did not activate controls or change inventory/cash
untested_scope: actual Safari/iOS and Android hardware; performance budget
confidence: medium
human_decisions_required: user approved fixed landscape with small portrait controls; production publication is separate
```

## Underground Data Center Presentation

The current world uses bright service chambers in a geological cutaway, sealed
department expansion portals and distinct server, GPU, storage, network, cooling
and compute hardware. Data cartridges have connector sockets and contacts;
queues, work indicators and payouts follow existing economy state. The compact
HUD names departments and depth while retaining cash, income and capacity.
Original terrain, seven named heroes, 16-bone rigs, level evolution, independent
managers, upgrade controls, contracts, optional bonuses and v3 saves are retained.

Company math quests show authored hints after wrong answers without a reward.
Correct answers retain their worked solution, an illustrative diagram and exact
awarded reward, disable answers and move focus to CONTINUE back to company.
Completion is persisted immediately through the existing save writer. BACK and
Escape never reward a skipped quest; restored completions cannot replay rewards.

Focused editor gates are `Mathscript3DOnlyChecks.Run`,
`MathscriptDashboardChecks.Run` and
`MathscriptPrototype.MathscriptTycoonUI.RunPresentationChecks`. The presentation
gate uses disposable saves, not player progress. `-idleMinerSmoke` additionally
checks all three lessons, focus, continuation and v3 disk reloads. New native and
WebGL visual/input verification must run against isolated candidates; no
distributed app was rebuilt for this presentation change. This is original
Mathscript art and learning UX, not full commercial-game equivalence.

## Company Freight Contracts

The processing center now has optional in-game company contracts and a physical
freight pickup bay. Open CONTRACTS at the pipeline dock or COMPANY CONTRACTS in
the company dialog. Vector Labs orders 12 RC with a 20% premium and a $35
completion bonus. Helix Cloud unlocks at 36 processed RC and orders 36 RC with a
35% premium and $100 bonus. Atlas Research unlocks at 120 processed RC and orders
90 RC with a 50% premium and $300 bonus. Completed companies can be renewed.

The elevator still delivers raw RC to the existing processor. Contracted output
is staged as real dispatch inventory; a company-branded truck reverses into the
bay, visibly loads crates and drives out. Each delivery credits its reserved
shipment once. Truck capacities are 6, 12 and 18 RC. Only one order is active at
a time. Uncontracted or excess output retains the existing immediate sale.

Version-3 saves gain optional logistics state without resetting existing towers.
Orders, dispatch stock, reserved vehicle cargo and trip timers survive reload;
offline progress uses the same pickup simulation. Confirmed refactors discard
active orders and undelivered cargo while retaining completed contract history.
These are simulated client companies, not external accounts or legal contracts.

`MathscriptContractChecks.Run` covers all company quotas, capacities, premiums,
one-time bonuses, elevator/processor handoff, cargo conservation, renewal,
in-transit recovery, offline parity, legacy saves, refactors and scene/UI binding.
WebGL and macOS builds include this gate. The native `-idleMinerSmoke` journey
also exercises signing, visible loading and truck departure. The frontend's
`tests/verify-unity.mjs` tests actual desktop and touch input, visible loaded
vehicles, fulfillment, transit reloads and responsive text fit.

## Current Dashboard and Realism Pass

The current Idle Tower uses a restrained industrial HUD with available cash,
estimated automated income, department stock, lift load, vault queue, managed
output and rated stage capacities. COMPANY includes a live earnings and output
ledger. Manual departments display actual RC per action rather than implying
automated production. Number formatting groups thousands, supports K/M/B/T,
promotes rounded units and keeps exact totals in tooltips.

Organic rock outcrops, mottled ground, original cutout conifers with light wind,
crate straps, compiler intake/display hardware and workstation/service details
extend the scanned material upgrade. Moving assemblies stay separate from world
batching; loaded cargo follows the real lift payload. Gameplay formulas and the
version-3 save contract are retained.

`MathscriptDashboardChecks.Run` verifies formatting, locale consistency, manual
yield and estimated income. It runs with the existing realism build gates.
The browser regression also checks rendered numeric label fit and disposable
billion-scale balances. The native release is
`Builds/macOS-Release/Mathscript Idle Tower.app`; WebGL runs at `/unity`.

Isolated Unity 6000.6.3f1 experiment. The Mathscript website, original tycoon,
backend and production saves are not modified or accessed.

Open this folder in Unity Hub. Open `Assets/Scenes/Prototype.unity` and press
Play, or launch `Builds/macOS/Mathscript Tycoon.app` after building.

Production creates inventory every two seconds, capped at 20 items. Dispatch
reserves the current stock. A correct multiplication answer completes the sale
once. Coins buy production upgrades. Incorrect answers preserve the order.
Production continues while an order is pending. There is no offline production.

Prototype saves use `Application.persistentDataPath/prototype-v1.json` under the
separate MathscriptPrototype company identity. Pending orders survive reload.
These saves are not compatible with the live game's full economy snapshot.

Editor entry points: `PrototypeChecks.Run` runs deterministic economy and JSON
checks; `PrototypeBuild.Build` checks, creates the scene and builds macOS.
The built player accepts `-prototypeSmoke` to exercise the loop, capture a frame
and exit without reading or writing player saves. This is a runtime smoke check,
not automated mouse/keyboard coverage.

This first build is native macOS, not a browser replacement. Web export,
authentication, backend save integration, existing floors and assets remain
separate migration work. No downloaded idle-game template is included.

## Playable Mathscript Idle Tower

The current economy milestone is `Assets/Scenes/MathscriptIdleMiner.unity`.
Run `PrototypeBuild.BuildIdleMiner` to run parity checks and build
`Builds/macOS/Mathscript Idle Tower.app`. The original factory is preserved.

The tower starts with 1,000 coins and one level of Arcanos' Server Room.
Generate RC manually, send the data bus, and compile RC into coins. Hire floor,
bus and compiler managers independently to automate each stage. Unlock floors
in order; floor purchases support x1, x10 and Max. Six sector tracks upgrade
capacity, travel, loading, batches, processing and conversion. Total-level
thresholds offer optional math bonuses; ordinary compiler payout is not gated.

The default cutaway shows three shafts on desktop and two in portrait. Arrow
controls remain available during elevator trips. Every stocked shaft is reached
by a physical elevator route; camera scrolling never changes delivery or income.
Local saves preserve reserved RC and in-progress stage timers under the distinct
Mathscript Idle Tower identity, using `mathscript-idle-miner-v1.json`.
Offline progression begins at one minute and caps at eight hours. Hired floors
retain output even without sector managers; transport and compilation resume
their actual saved jobs. Returning uses the live economy simulation, and progress
is written immediately to prevent replay.

`MathscriptParityChecks.Run` covers source costs, rates, routing, independent
automation, bonus lifecycle, offline limits and actual disk restart recovery.
The native player accepts `-idleMinerSmoke` for an isolated automated run with
base, upper-floor, bonus and smaller-window screenshots. This does not test
physical mouse/keyboard interactions.

This is economy parity, not complete game parity: research, prestige, active
manager skills, analogy quests, cloud accounts/saves and browser export are
not implemented in the original milestone. See the current repair below for
implemented progression and WebGL support. Commercial Idle Miner assets are not used.

## Mathscript UI Port

The tower now uses Unity UI Toolkit for the Mathscript currency header,
operations strip, left data-bus shaft, two server rooms and loading dock.
Room-local Generate, Manager and Options controls replace the floor table.
The dock provides PROD, SEND, COMPILE and separate sector options. Upgrade
dialogs include x1/x10/Max, manager hiring and all six existing sector tracks.
Bonus dialogs block background input, cycle keyboard focus and close on Escape
(skipping a bonus without a reward). Server fans and hero workers animate when
their floor manager is hired.

The seven portraits are rasterized from the existing Mathscript SVG assets;
Rajdhani and current Fredoka fonts are bundled with their OFL licenses.
`Tools/TransparentPortraits.swift` removes the rasterizer's white background.
The UI follows the active Mathscript layout and palette, but does not claim
complete visual/gameplay parity or expose unsupported research/prestige actions.

`-idleMinerSmoke` now submits UI navigation events to verify Generate, hiring,
floor upgrades, bonus answers, viewport navigation, Send and Compile. It also
exercises Tab and Escape, captures floor/bus options and asserts the four UI
bands at explicit 1280x800 and 960x600 window sizes. These are synthetic UI
events, not physical input or native screen-reader accessibility verification.

## Perspective and Progression

Normal launch now opens the 3D-only data center with no view switch.
The world renderer has articulated crew, level-based
equipment and crew counts, department accents, stock, a moving lift and delivery
packets. This is procedural native art, not commercial Idle Miner assets.

COMPANY opens ordered research purchases, one-time analogy quests and confirmed
Prime Refactor. Refactor resets the operating economy while retaining research,
lifetime earnings and permanent tokens. Floor, bus and compiler options expose
30-second manager skills with 150-second activation cooldowns. Version-1 saves
migrate to version 2; restarts expire skill effects without replaying rewards.

The isolated smoke run checks progression through UI events and captures moving,
nonblank perspective scenes at 1280x800 and 960x600. Production accounts and real
saves are not accessed by these checks.

Cloud continuity is not connected. The web API requires a web session identifier
and nested floor/bus/compiler/manager snapshots; Unity uses a different versioned
save format. Native account linking and a tested bidirectional schema adapter
are required before writing to that API. No placeholder upload or silent web-save
overwrite has been introduced. Full commercial world/event content is not ported.

## Current Idle-Miner Repair

The default Unity scene is a front-on, vertically stacked mine cutaway with
surface logistics, a moving elevator cage, physical resource stacks, readable
crew, locked-shaft excavation states and shaft-aligned manager/upgrade controls.
Portrait framing compresses the architecture without shrinking crew. The original
Mathscript departments, optional math rewards, research, skills and refactor stay.

Save version 3 uses absolute shaft positions. Versions 1 and 2 migrate without
resetting money, managers, inventory, pending trips or permanent progression.
Browser writes auto-sync to IndexedDB through the project WebGL template.
`Assets/WebGLTemplates/Mathscript/index.html` keeps the canvas full-viewport and
provides loading/retry states. The site route is `/unity`.

`MathscriptParityChecks.Run` verifies camera-independent routing, deep-trip restart,
resource conservation, legacy migration, rewards, upgrades and offline limits.
`-idleMinerSmoke` validates UI actions and rendered motion, exiting nonzero on any
exception. `frontend/tests/verify-unity.mjs` in the web repository tests actual mouse
and touch input, delivery, payout, bonus, moving pixels and reload persistence.
Its snapshot bridge is read-only; it cannot grant resources or mutate saves.

This is a repaired seven-shaft Mathscript game inspired by Idle Miner Tycoon's
layout and workflow, not a complete copy of its art, event content or economy.
Cloud save/account linking and real-device GPU performance remain unverified.

## Guided Idle Progression

The operations strip guides independent floor, bus and compiler automation before
production or pipeline investments. Suggestions display real prices, surface
existing math quests when funding is short, and compare useful throughput rather
than choosing the cheapest unrelated track. Prestige still requires confirmation.
Actual output milestones appear on department panels and in floor options,
including portrait layouts.

Short landscape uses a readable single-floor view with navigation through shaft
seven. Rotation adjusts UI scale and viewport limits. Long dialogs scroll within
the screen; keyboard focus scrolls with their controls.

Returning players see already-persisted cash, produced/compiled RC and retained
stock. Simulation preserves reserved resources and skill duration; cooldown time
advances once for the full absence. Completed automated payouts save immediately
instead of waiting for the five-second autosave.

`MathscriptIdleLoopChecks.Run` covers offline/live equality, partial automation,
transit recovery, replay protection, limits, skills, useful guidance, affordability
and milestone promises. WebGL export runs it with the parity and 3D-only gates.
The frontend's `tests/verify-unity.mjs` exercises guided automation and an aged
disposable IndexedDB save with actual mouse and touch input. Cloud continuity,
expanded events and human pacing remain separate work. See
`frontend/docs/unity-idle-build-audit.md` in the web checkout for the audit.

## Realistic Surface and Motion Build

The current native and WebGL builds use linear lighting, verified CC0 scanned
rock/concrete/steel/bark color and normal maps, shared beveled equipment, practical
shaft lights, structural supports, workbenches, safety edges, and cooling grilles.
The front-on mine retains its controls with a slight viewing angle for visible
depth. Crew joints and turning blend at frame-independent rates; the elevator
eases visually without changing travel times, production, or save data.

`MathscriptRealismChecks.Run` validates geometry bounds, outward normals, shared
resources, mipmapped 1K textures, linear normal imports, atmosphere, crew evolution,
joint convergence, and elevator interpolation. Both build entry points run it.
The native release is `Builds/macOS-Release/Mathscript Idle Tower.app`.
Characters and foliage remain original procedural assets, not photorealistic scans.