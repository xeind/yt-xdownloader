# Agent Guidelines for yt-xdownloader

## Build/Lint/Test Commands
- Dev server: `bun run dev` (uses Vite + Bun runtime)
- Build: `bun run build` (TypeScript compile + Vite build)
- Lint: `bun run lint` (ESLint)
- Type check: `tsc -b` (manual TypeScript check)
- No test framework configured - suggest adding vitest or jest if tests needed

## Code Style & Conventions
- **Runtime**: Uses Bun as JavaScript runtime, ES modules
- **Framework**: React 19 + TypeScript + Vite + TailwindCSS
- **Imports**: ES6 imports, React hooks from 'react', assets with relative paths
- **TypeScript**: Strict mode enabled, no unused locals/parameters, verbatim module syntax
- **Formatting**: Tab indentation (as seen in App.tsx), JSX with react-jsx transform
- **Components**: Function declarations, default exports, PascalCase naming
- **Styling**: TailwindCSS classes, separate CSS files for global styles
- **ESLint**: Uses recommended configs for TypeScript, React hooks, and React refresh

## Notes
- Project uses latest React 19 and modern TypeScript configs
- No existing test setup - recommend vitest for new tests
- Bun is the preferred package manager and runtime