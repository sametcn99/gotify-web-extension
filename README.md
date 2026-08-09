<a href="https://extension.js.org" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/Powered%20by%20%7C%20Extension.js-0971fe" alt="Powered by Extension.js" align="right" /></a>

# Gotify Web Extension

> A browser extension for monitoring a self-hosted Gotify server and receiving native desktop notifications.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Built with React](https://img.shields.io/badge/Built%20with-React-61dafb.svg)](https://react.dev/)
[![Built with Extension.js](https://img.shields.io/badge/Built%20with-Extension.js-0971fe.svg)](https://extension.js.org/)

## Overview

Gotify Web Extension brings the most useful parts of a Gotify inbox into a browser extension. Connect it to your own Gotify server, browse messages by application, and receive native notifications while the extension runs in the background.

The project is designed for people who already operate a Gotify instance and want a lightweight desktop workflow without keeping the Gotify web interface open in a tab.

## Features

- Connect to a self-hosted Gotify server with a client token.
- Poll the Gotify server for new messages on a configurable interval with alarms-based recovery.
- Display native desktop notifications for incoming messages.
- Browse recent messages and filter them by application.
- Display application names and logos from the connected Gotify server.
- Expand long messages and inspect message extras.
- Delete individual messages or all messages in the current view.
- Configure polling intervals, quiet hours, and disabled notification applications.
- Switch between light and dark themes.
- Use a responsive layout with a desktop sidebar and mobile navigation drawer.
- Open the extension settings page from the browser's extension menu.

## Supported Browsers

Production build scripts are provided for:

- Chromium-based browsers, including Chrome and Chromium.
- Microsoft Edge.
- Firefox.

The extension uses browser APIs through Extension.js and includes the manifest differences required for Chromium Manifest V3 and Firefox Manifest V2 builds.

## Installation

### Build from source

Prerequisites:

- [Bun](https://bun.sh/) 1.3 or newer.
- A reachable Gotify server.
- A Gotify client token with permission to read and delete messages.

Clone the repository and install dependencies:

```bash
git clone https://github.com/sametcn99/gotify-web-extension.git
cd gotify-web-extension
bun install
```

Build for your browser:

```bash
bun run build           # Chromium
bun run build:firefox  # Firefox
bun run build:edge     # Microsoft Edge
```

The generated extension is written to `dist/`. Load the browser-specific output as an unpacked or temporary extension using your browser's extension development tools.

### Development mode

Start a development build for the default browser:

```bash
bun run dev
```

To select a browser explicitly:

```bash
bun run dev -- --browser=firefox
bun run dev -- --browser=edge
```

## First Use

1. Open the extension from the browser toolbar.
2. Enter the base URL of your Gotify server, such as `https://gotify.example.com`.
3. Enter a Gotify client token and sign in. Application tokens cannot delete messages.
4. Select **All Messages** or an individual application from the sidebar.
5. Open settings to adjust polling and notification behavior.

The server URL is normalized before API requests are made. Application logos returned as relative paths by Gotify are resolved against that server URL.

## Privacy and Permissions

This extension is intended for self-hosted Gotify deployments. Message content and connection settings are handled locally by the extension and sent only to the Gotify server configured by the user.

The extension requests permissions for:

- `storage`, to persist the connection configuration and local runtime state.
- `notifications`, to display native desktop notifications.
- `alarms`, where supported by the target browser for scheduled background work.
- HTTP and HTTPS host access, to communicate with the configured Gotify server.
- Network request rules, scoped to this extension's Gotify deletion requests, to remove the browser-added extension origin that Gotify rejects for cross-origin API access.

Tokens should be treated like passwords. Do not commit tokens, server credentials, generated profiles, or build output containing private data.


## Project Status

The project is actively developed. Feedback, bug reports, and focused pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow and technical conventions.

## License

This project is available under the [MIT License](LICENSE).

## Acknowledgements

- [Gotify](https://gotify.net/) for the self-hosted notification server.
- [Extension.js](https://extension.js.org/) for the browser extension toolchain.
- [React](https://react.dev/) and [MUI](https://mui.com/) for the application UI.
