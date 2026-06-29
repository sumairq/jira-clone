# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Monorepo with two independent npm packages:

- `api/` — Node.js + Express + TypeScript + TypeORM (PostgreSQL) backend
- `client/` — React 19 (JS, no TS) + Webpack + styled-components 6 frontend

> The app is branded **"Orbit"** (indigo/violet design system). Brand assets: `client/src/shared/components/Logo.jsx` (the orbit-ring + planet mark), `client/src/favicon.png` (Orbit favicon, injected by HtmlWebpackPlugin), and the central design tokens in `client/src/shared/utils/styles.js`.

Adding a client dependency usually needs `npm install <pkg> --legacy-peer-deps` (there's a pre-existing eslint peer-dep conflict that aborts a bare `npm install`). Note also: with React 19's new JSX transform, every file shows an eslint warning `'React' is defined but never used` — that's expected, not a bug to fix.

The root `package.json` only orchestrates: `npm run install-deps` installs all three (`root`, `api`, `client`); `npm run build` and `npm run start:production` fan out to both subpackages. Husky's `pre-commit` runs `lint-staged` in each subpackage (eslint --fix + prettier).

## Common commands

Development (run in two terminals):

```bash
cd api && npm start            # nodemon + ts-node, listens on PORT or 3000
cd client && npm start         # webpack-dev-server on 8080
```

Tests:

```bash
cd api && npm run start:test                       # boots API against jira_test DB
cd client && npm run test:cypress                  # opens Cypress runner
cd client && npm run test:jest                     # Jest (no test files currently exist)
```

To run a single Cypress spec, use `node_modules/.bin/cypress run --spec cypress/integration/<name>.spec.js` from `client/`.

Build / production:

```bash
cd api && npm run build                            # tsc → api/build/
cd api && npm run start:production                 # pm2 + tsconfig-paths.js shim (resolves baseUrl in built JS)
cd client && npm run build                         # webpack production → client/build/
cd client && npm run start:production              # pm2 serves build/ via server.js (port 8081)
```

## API architecture

Entrypoint `api/src/index.ts` wires the request pipeline in this exact order:

1. `cors`, `express.json`, `express.urlencoded`
2. `addRespondToResponse` — attaches `res.respond(data)` (200 + send) used by every controller instead of `res.json`
3. `attachPublicRoutes` — `POST /authentication/guest`, `/authentication/register`, `/authentication/login` (and `/test/*` when `NODE_ENV=test`)
4. `authenticateUser` middleware — gates everything below; reads `Bearer` JWT, loads `User`, sets `req.currentUser`
5. `attachPrivateRoutes` — comments / issues / project(s) / currentUser (incl. `POST /projects`, `POST /project/switch`, `PUT /currentUser`)
6. 404 → `RouteNotFoundError`, then `handleError`

Anything added after `app.use('/', authenticateUser)` is private by default. Public-only endpoints must be registered inside `attachPublicRoutes`.

### Controllers, errors, and the response shape

Controllers (`api/src/controllers/*.ts`) are thin: wrap each handler in `catchErrors` (from `errors/asyncCatch.ts`) so thrown errors flow into the error middleware. Always return data via `res.respond({ ... })` rather than `res.send`/`res.json` — the test layer and frontend `api.js` both expect this shape.

Throw a `CustomError` subclass (`errors/customErrors.ts`) for any client-facing failure: `EntityNotFoundError`, `BadUserInputError`, `InvalidTokenError`, `RouteNotFoundError`. `handleError` only forwards `message/code/status/data` for `CustomError` instances; anything else collapses to a generic 500. The frontend specifically branches on `error.code === 'INVALID_TOKEN'` to log the user out, so don't reuse that code for other auth failures.

### Entities and persistence

TypeORM with `synchronize: true` (no migrations — schema is rebuilt from decorators on every boot). Entities live in `api/src/entities/` and are barrel-exported from `entities/index.ts`; `createConnection.ts` registers `Object.values(entities)`.

CRUD goes through helpers in `api/src/utils/typeorm.ts`:

- `findEntityOrThrow` — throws `EntityNotFoundError` with the constructor name
- `createEntity` / `updateEntity` — call `validateAndSaveEntity`, which reads a static `validations` map on the entity (see `Issue.validations`) and feeds it through `utils/validation.ts`'s `is.*` validators, throwing `BadUserInputError` on failure
- `deleteEntity` — find then `instance.remove()`

When adding a new entity, follow the pattern in `Issue.ts`: extend `BaseEntity`, declare a `static validations`, export it from `entities/index.ts`, and add it to the `entities` map in `utils/typeorm.ts` (otherwise validation will be silently skipped).

### Path aliases

`tsconfig.json` sets `baseUrl: src` with `paths: { "*": ["./*"] }`, so imports look like `import { User } from 'entities'`, not relative paths. Two consequences:

- Dev (`ts-node`) works directly thanks to `--files` and tsconfig paths
- Prod (compiled JS) needs `tsconfig-paths.js` to be `-r`-loaded — `start:production` already does this; any new entrypoint must too

`api/src/types/express.d.ts` augments Express with `res.respond` and `req.currentUser` — keep types consistent with the `addRespondToResponse` and `authenticateUser` middleware.

### Environment

`api/src` reads `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`, `JWT_SECRET`, `PORT` from `.env` (loaded via `dotenv/config`). The README expects a local DB named `jira-clone_development` and `jira_test` for tests. SSL is currently commented out in `createConnection.ts` — re-enable the `ssl` block (and `ca-certificate.crt`) when targeting a managed Postgres.

### Authentication: register / login / guest

There are three ways in (all public, all return a JWT):

- `POST /authentication/register` and `/login` — real email/password auth (`controllers/authentication.ts`, bcrypt; `User.password` is `select: false`). A freshly registered user has **no active board** (`projectId` is null).
- `POST /authentication/guest` — calls `database/createGuestAccount.ts`, which seeds 3 users + 1 project + 8 issues + comments and returns a JWT for `users[2]`. This is the **demo** entry point, not the only way to boot.

### Multi-board model

A user belongs to many boards and has one *active* board. `User.project` (+ `projectId` RelationId) is the **active-board pointer**; `User.projects ⇄ Project.users` is a `@ManyToMany` membership join (assignee pool). `GET /project` returns the active board (`{ project: null }` when the user has none → onboarding); `GET /projects` lists membership; `POST /projects` creates a board (default category `SOFTWARE`, adds the creator as member, sets it active); `POST /project/switch` flips the active pointer (membership-checked). New boards start with **zero issues** — the four columns render from the `IssueStatus` constants.

## Client architecture

`client/src/index.jsx` mounts `<App />`, which composes global styles, `<Toast />`, and `<Routes />` (`App/Routes.jsx`):

- `/` → `Auth/Login` (the login **and** the landing screen) · `/register` → `Auth/Register`
- `/login` and `/authenticate` → redirect to `/` (legacy paths kept working)
- `/project/*` → `PrivateRoute` (redirects to `/` if no stored token) → `Project/index.jsx`
- `*` → `PageError`

`Project/index.jsx` fetches `/project` (active board) and `/projects` (board switcher). If the active board is `null` it renders `Onboarding` (first-run empty state + "create your first board"). Otherwise it renders `NavbarLeft`, `Sidebar` (board switcher), and nested routes: `Board` (`board/*`), `Analytics` (`analytics`), `ProjectSettings` (`settings`), `UserProfile` (`profile`), plus the `IssueSearch` / `IssueCreate` / `BoardCreate` modals.

### Absolute imports

Webpack `resolve.modules` includes `src/`, and `jsconfig.json` sets `baseUrl: ./src` so VS Code matches. Imports look like `import api from 'shared/utils/api'` — never relative-traverse out of a feature folder.

### API layer

`shared/utils/api.js` wraps axios. `baseURL` defaults to `http://api.sumair.ml:3000` if `process.env.API_URL` is unset — override `API_URL` (via webpack DefinePlugin or env) when pointing at a local API. The wrapper:

- Auto-attaches `Bearer ${getStoredAuthToken()}`
- On `INVALID_TOKEN`, clears the stored token and pushes `/authenticate`
- Exposes `api.optimisticUpdate(url, { updatedFields, currentFields, setLocalData })` — sets local state immediately, rolls back + toasts on failure

`shared/hooks/api/` exports `useApi` with `.get` (= `useQuery`) and `.post/.put/.patch/.delete` (= `useMutation`). `useQuery` has an in-module `cache` keyed by URL with `cache-first` / `cache-only` / `no-cache` policies. The `setLocalData` returned from `useQuery` updates both React state and the shared cache — use it for optimistic edits so cached pages reflect mutations.

### Design tokens

`client/src/shared/utils/styles.js` is the **single source of truth** for the Orbit theme: `color` (indigo `#4F46E5` primary, violet `#7C3AED` accent, slate neutrals, semantic success/warning/danger), `font` (Inter), `spacing`, `radius`, `shadow`, `mixin`, plus the issue color maps (`issueTypeColors`, `issuePriorityColors`, `issueStatusBackgroundColors`). Retuning a token here propagates app-wide — prefer it over hard-coded values.

### Feature folder shape

Each feature under `Project/` (e.g. `Board`, `Analytics`, `IssueDetails`, `IssueCreate`) follows: `index.jsx` (entry), `Styles.js` (styled-components), and subfolders per sub-feature. Shared primitives (`Button`, `Modal`, `Form`, `Icon`, `Select`, `TextEditor`, etc.) live under `shared/components/` and are barrel-exported from `shared/components/index.js`.

### Analytics view & charts

`Project/Analytics/` is a board dashboard (`/project/analytics`). It re-reads `/project` via `useApi.get` (served instantly from the warm cache) and aggregates **client-side** (lodash) from the issues already in the payload — no analytics endpoint. Charts use **recharts** (themed to the Orbit tokens) and only fields that survive the `issuePartial` serializer (`status`, `priority`, `userIds`, `createdAt`); there is no completed-at/status-change date, so the time chart is *issues created over time*, not a burndown. It renders loading (skeleton) / error / empty states. Its stat cards/charts deep-link into the List view (below). Reuse this pattern (cached fetch + client aggregation + token-derived colors) for any new chart.

### List / Table view

`Project/List/` is a dense, sortable, filterable table of the board's issues (`/project/list`, "List" in the sidebar). Same self-owned `/project` fetch + **client-side** filter/sort/group (no new endpoint). Its distinguishing pieces:

- **URL-encoded view state** (`useViewState.js` + `shared/utils/url.js`): search/filters/sort/grouping live in the query string (`q`, `status[]`, `assignee[]`, `priority[]`, `sort`, `dir`, `group`) so views are shareable and restore on reload. The board's own filters are still in-memory — this is the first URL-driven filter state.
- **Inline & bulk edits** go through the same `api.optimisticUpdate('/issues/:id', …)` as the board; a local `updateLocalProjectIssues` writes the shared cache so the board stays in sync. Assignee changes must send the `users` relation (the `userIds` RelationId is read-only).
- Reuses `IssuePriorityIcon` / `Avatar` / `Select` / `IssueTypeIcon`; the status chip is rebuilt from `issueStatus*` tokens + `mixin.tag`.
- Responsive via horizontal scroll + sticky title column. **No labels or due-date columns** — those fields don't exist on `Issue` (TODO markers note where they'd go); the date column uses `updatedAt`.

### Modal pattern

Modals are URL-driven: `shared/utils/queryParamModal.js` provides `createQueryParamModalHelpers(name)` returning `{ open, close, isOpen }` that toggle a query param. `Project/index.jsx` shows the canonical usage for `issue-search` and `issue-create`.

## Conventions

- Backend uses TypeScript strict mode (`noImplicitAny`, `strictNullChecks`); frontend is plain JS + PropTypes
- Backend formatting: airbnb-base + prettier (single quotes, trailing commas — see existing files); frontend: airbnb + react + prettier
- Both run `lint-staged` on commit via root husky — don't bypass with `--no-verify`
- Filenames: PascalCase for React components and TypeORM entities, camelCase for utils/hooks/controllers
- Cypress assumes the client at `localhost:8080` and API at `localhost:3000` (`client/cypress.json`); `start:test` sets `NODE_ENV=test` to expose `/test/reset-database` and `/test/create-account` for the suite
