# Contributing to Gotify Web Extension

Thank you for contributing. This guide explains how the extension is structured, how to run it locally, and what is expected from changes submitted to the project.

## Before You Start

Please check the existing issues and pull requests before starting significant work. For larger changes, open an issue first so the scope and implementation direction can be discussed.

Small bug fixes, documentation improvements, accessibility fixes, and focused UI improvements can usually be submitted directly as a pull request.

## Development Requirements

- Windows, macOS, or Linux.
- [Bun](https://bun.sh/) 1.3 or newer.
- A Chromium-based browser, Firefox, or Edge for manual testing.
- A reachable Gotify server and token for authenticated feature testing.
- Git.

Install the project locally:

```bash
git clone https://github.com/sametcn99/gotify-web-extension.git
cd gotify-web-extension
bun install
```

## Available Commands

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start Extension.js development mode for the default browser. |
| `bun run dev -- --browser=firefox` | Start development mode for Firefox. |
| `bun run dev -- --browser=edge` | Start development mode for Edge. |
| `bun run build` | Build the default Chromium target. |
| `bun run build:chrome` | Build the Chrome target explicitly. |
| `bun run build:firefox` | Build the Firefox target. |
| `bun run build:edge` | Build the Edge target. |
| `bun run preview` | Preview a production build. |
| `bun run check` | Run Biome checks and apply safe formatting fixes. |

Always run `bun run check` and at least one relevant production build before opening a pull request.

## Architecture

The project is a React and TypeScript browser extension built with Extension.js.

```text
src/
  app/          React UI, components, hooks, and presentation utilities
  content/      Content-script entry points and page integration code
  images/       Extension assets
  options/      Extension options-page entry point
  shared/       Types and browser-storage helpers shared by UI/background code
  background.ts Background polling, Gotify API calls, state, and notifications
```

### UI layer

`src/app/App.tsx` is the UI composition root. It coordinates authentication state, selected applications, message loading, dialogs, navigation state, and theme providers. Feature-specific behavior belongs in components and hooks rather than being added directly to the composition root.

Important UI areas include:

- `components/Header.tsx`: fixed application header and global actions.
- `components/Sidebar.tsx`: application navigation and responsive drawer behavior.
- `components/MessageList.tsx`: message loading states, filtering context, and expansion state.
- `components/MessageCard.tsx`: message presentation, priority styling, application identity, deletion, and preview expansion.
- `hooks/useGotify.ts`: UI-facing bridge for background requests and runtime state.
- `hooks/useThemeMode.ts`: light/dark theme selection.
- `utils.ts`: image URL resolution, formatting, and shared presentation helpers.

Keep reusable UI behavior close to the component or hook that owns it. Avoid duplicating Gotify URL normalization or application-image handling in individual components.

### Background layer

`src/background.ts` owns communication with the Gotify server and browser APIs. It is responsible for:

- Normalizing the configured server URL.
- Sending the token through the `X-Gotify-Key` request header.
- Loading applications and messages.
- Deduplicating and sorting messages.
- Polling for new messages.
- Applying quiet-hours and disabled-application notification rules.
- Publishing runtime state to extension storage.
- Creating native browser notifications and badge counts.
- Handling toolbar clicks and notification link targets.

Keep network and browser API access in the background layer. React components should request actions through the existing messaging abstraction instead of calling Gotify directly.

### Shared state and storage

`src/shared/types.ts` defines the contracts used between the background and UI layers. `src/shared/storage.ts` persists two logical records in `browser.storage.local`:

- `gotify.config`: server URL, token, polling interval, and notification settings.
- `gotify.state`: connection status, user/application data, recent messages, and notification metadata.

When changing a shared type, inspect both its background producers and UI consumers. Preserve backwards-compatible defaults when adding persisted settings; existing installations may not have the new field.

## Gotify API and Authentication

The extension uses the Gotify HTTP API through the configured server URL. Requests are assembled in the background script and authenticate with the `X-Gotify-Key` header when a token is configured.

The UI does not store or transform API responses independently. Application data is kept in a record keyed by application ID so messages can resolve their application name and image efficiently. Message cards must use the shared application map and `getImageUrl` when rendering application logos.

When adding an API call:

1. Add or update the relevant request and response types in `src/shared/types.ts`.
2. Implement the request in `src/background.ts`.
3. Add a `BackgroundRequest` variant if the UI needs to invoke it.
4. Return a typed `BackgroundResponse` and update the UI hook.
5. Handle loading, failure, empty, and authenticated states in the UI.
6. Verify behavior against a real Gotify server when possible.

Do not log tokens, authorization headers, message secrets, or complete private message payloads.

## Browser and Manifest Details

`src/manifest.json` contains browser-specific Extension.js manifest keys. Chromium targets use Manifest V3 with a service worker; Firefox targets use Manifest V2 with background scripts.

When changing manifest permissions or background behavior:

- Verify the change in both Chromium and Firefox builds.
- Keep permissions as narrow as the feature allows.
- Check that action APIs work through the compatibility handling in `background.ts`.
- Test notification, storage, alarm, and toolbar behavior in each affected browser.

The generated `dist/` directory and Extension.js browser profiles are build artifacts and should not be committed.

## Coding Conventions

- Use TypeScript for application and background code.
- Follow the existing Biome formatting and import ordering.
- Use double quotes and tabs in files already formatted by Biome.
- Prefer existing MUI components, theme values, and project utilities over custom primitives.
- Keep components focused and pass behavior through typed props.
- Use semantic labels and accessible names for icon-only controls.
- Preserve responsive behavior across mobile and desktop layouts.
- Keep user-facing text in English unless the project introduces a localization system.
- Avoid unrelated refactors in feature pull requests.
- Do not add credentials, personal server URLs, generated profiles, or private message data.

## Validation Checklist

Before submitting a pull request:

1. Run `bun run check`.
2. Run `bun run build` for Chromium.
3. Run the browser-specific build affected by the change, such as `bun run build:firefox`.
4. Manually test the changed flow with a real or local Gotify server.
5. Test both authenticated and logged-out states when UI behavior is affected.
6. Check mobile and desktop layouts for responsive changes.
7. Confirm that no secrets or generated build artifacts are included in the diff.

There is currently no dedicated automated test suite in the repository. Manual validation and the Biome/build checks are therefore required evidence for changes.

## Pull Requests

A good pull request should:

- Explain the user-visible problem and the chosen solution.
- Keep the change focused.
- Include screenshots or a short recording for visual changes when useful.
- Mention the browsers and commands used for validation.
- Call out any required Gotify server version, permission, or configuration.
- Update documentation when behavior, setup, or commands change.

Use a concise title in the imperative mood, for example `Add application avatars to message cards` or `Fix Firefox notification polling`.

## Commit Guidance

Keep commits small and coherent. A commit should represent one logical change and should not include generated `dist/` output. Descriptive messages such as `Fix relative application image URLs` are preferred over vague messages such as `Update code`.

## Reporting Bugs

Include the following information when reporting a bug:

- Browser and version.
- Extension build target.
- Gotify server version.
- Steps to reproduce.
- Expected and actual behavior.
- Relevant console or build errors with tokens and private message content removed.
- Screenshots for visual issues.

## License

By contributing, you agree that your contribution is provided under the project's [MIT License](LICENSE).