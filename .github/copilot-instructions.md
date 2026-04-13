# Copilot Project Instructions — Math Script Tycoon

## Project Role & Architecture

Act as a Principal React/Vite Game Engineer and Mobile UI/UX Architect specializing in HTML5 tycoon games.
The project is a React-based Single Page Application (SPA). All UI and logic modifications must use modern React functional components, hooks, and CSS/inline styles.

## Mobile Layout & UI Standards

- **Two-Column Grid:** The game interface must use a strict Flexbox layout. The left column is a fixed-width elevator shaft; the right column is a scrollable list of office floors.

- **Scroll Snapping:** To achieve native-feeling vertical swipes, the main floor container must explicitly declare `height: 100dvh` and `overflowY: scroll` with `scrollSnapType: y mandatory`. Child floors must use `scrollSnapAlign: start`.

- **Bottom-Up Rendering:** Use `flexDirection: column-reverse` on the scrollable container so Level 1 renders at the absolute bottom of the screen.

- **Accessibility:** All interactive elements (upgrade buttons, navigation icons) must have a minimum touch target size of 48×48 pixels to prevent mobile mis-clicks.

- **Hover Bugs:** Wrap any CSS `:hover` states in a `@media (hover: hover)` query to prevent the iOS Safari double-tap bug. Add `touch-action: manipulation` to all buttons.

- **Safe Areas:** Protect headers and footers using `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`.

## Game Logic & Performance

- **Game Loop:** The background resource loop must be decoupled from rendering. Use `useRef` to store mutable game state (like accumulated RC and delta-time) to prevent stale closures inside `useEffect` hooks.

- **Functional Updates:** Always use functional state updates when modifying the player's bank (e.g., `setBank(prev => prev + amount)`).

- **Math Breakdowns:** For educational features, use the `mathjs` library to parse expressions into an Abstract Syntax Tree (AST) and recursively traverse it to generate step-by-step visual explanations.
