# AI Interview Bot – Chrome Extension

Answer questions fast during meetings. Select any question on the page (e.g., captions, chat, agenda) and press Alt+Q, or use the popup to type a question. The extension calls your API and shows an answer in a small overlay on the page.

## Install

- Open Chrome → More Tools → Extensions
- Enable Developer mode
- Click "Load unpacked" and select this folder: `chrome-extension`

## Configure

- Click the extension icon → Settings, or open `chrome-extension/options.html`
- Set:
  - API URL (POST endpoint)
  - API key (optional)
  - Auth header name (default `Authorization`) and whether to prefix `Bearer `
  - Request field names: `question`, `context`, `topic`
  - Response path (dot path) to extract the answer string (default `answer`). Examples:
    - `answer`
    - `choices.0.message`

The extension sends a JSON body like:

```
{
  "question": "...",
  "context": "...",
  "topic": "data_analytics"
}
```

If your API uses different keys, change them in Settings.

## Usage

- Select text on any page → press Alt+Q (or right‑click → "Ask AI about selection")
- Or click the popup, choose a topic, type a question, and click Ask
- Answers show in a draggable overlay; click Copy to copy

## Shortcuts

- Ask selection: Alt+Q

You can change shortcuts in Chrome → Extensions → Keyboard shortcuts.

## Permissions

- `storage` for saving settings
- `activeTab`/`scripting` to read selection and inject the overlay
- `contextMenus` for right‑click on selection
- `notifications` as a fallback if the overlay can’t render
- `host_permissions: <all_urls>` to allow calling your API from the service worker

## Notes

- This starter uses a simple JSON POST and extracts a string using the configured response path. If your API needs a different shape (query params, nested JSON, etc.), adjust `background.js` → `callApi()` accordingly.
- Auto‑listening to live captions/transcripts differs per platform (Meet/Zoom/Teams). The current version focuses on fast manual capture (selection + hotkey). If you want an automatic watcher for a platform, we can add a targeted content script.

## Troubleshooting

- Overlay not showing: some pages (e.g., Chrome Web Store, `chrome://` pages) block content scripts; the extension falls back to a notification with the answer.
- CORS: Service worker fetches are allowed; ensure your API accepts requests from extensions. If needed, add your extension ID to an allowlist.
- Empty answer: Check the Response Path in Settings matches your API response.

## Customize

- UI and overlay styles: `content.css`
- Overlay logic: `content.js`
- API call mapping: `background.js` → `callApi()`
- Popup UI behavior: `popup.html`/`popup.js`

