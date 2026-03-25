# Persona Non Grata

Chrome extension that hides GitHub PR comments from specific users. Built to combat AI agent reviewer spam.

## Features

- **Block users** — add GitHub usernames to hide their comments, reviews, and inline review threads
- **Hide noise** — toggle to remove commits, status events, draft markers, title changes — keeps only human reviews and approval statuses
- **Files Changed tab** — filters inline review threads on the React-based diff view by extracting author data from React fiber
- **Auto-filter** — MutationObserver catches lazy-loaded and dynamically inserted content
- **SPA-aware** — handles GitHub's turbo/pjax navigation
- **Synced** — blocklist syncs across devices via `chrome.storage.sync`

## Install

### From Chrome Web Store

_Coming soon_

### From source

1. Clone this repo
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** and select this directory

## Usage

1. Click the extension icon to open the popup
2. Add GitHub usernames to block (e.g. `coderabbitai`, `copilot`)
3. Toggle **Hide noise** to also remove commits and status events
4. Open any GitHub PR — blocked content is hidden automatically

## How it works

**Conversation tab:** Filters `.js-timeline-item` elements by matching `a.author` text against the blocklist. The "hide noise" mode uses DOM structure (commit icons, condensed items) and text matching to identify non-review timeline entries.

**Files Changed tab:** GitHub's React-based diff view doesn't expose author info in the DOM for collapsed review threads. The extension walks React's internal fiber tree to read `thread.commentsData.comments[0].author.login` from component props.

## Development

No build step. Edit files directly and reload the extension in `chrome://extensions`.

### Files

```
manifest.json    — Chrome MV3 extension manifest
content.js       — Content script injected on github.com
popup.html/css/js — Extension popup UI
icons/           — Extension icons (16, 48, 128px)
```

## Limitations

- Only works on `github.com` (not GitHub Enterprise)
- React fiber extraction may break when GitHub updates their frontend — the extension logs a console warning when this happens
- Hides entire threads based on the first comment's author — replies from non-blocked users in a blocked thread are also hidden

## License

MIT
