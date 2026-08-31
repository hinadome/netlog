# Import

First screen when no analysis is loaded (also reached via **New file**).

## Purpose

Load a Chromium net-export JSON file entirely in the browser and kick off parsing + diagnosis.

## What you see

- Brand / product framing (**Netlog Lens**)
- Drop zone: drag-and-drop or click to choose a `.json` file
- Progress panel while parsing (stage message + percent)
- Error banner if JSON is invalid or not a netlog shape
- Privacy note (local-only, strip tips, `chrome://net-export`)
- Link into the [Guide](guide.md) without importing a file

## Behaviors

| Action | Result |
|--------|--------|
| Drop or select a file | File is read and analyzed in a **Web Worker** |
| During load | Drop zone shows busy state; file input disabled |
| Success | App switches to the workspace with **Overview** selected |
| Failure | Message stays on Import; you can retry with another file |
| “How netlogs & session IDs work” | Opens Guide; **Back to import** returns here |

## Progress stages

Typical worker progress messages cover: reading → parsing / resolving events → indexing sources → modeling sessions → diagnosing → done.

## Accepted input

- Full netlog object: `{ "constants": {…}, "events": […], … }`
- Truncated JSON is lightly repaired when possible (trailing commas / missing closers) so incomplete exports may still open

## Related

- Capture steps: [README](../README.md#capture-a-netlog)
- After load: [Overview](overview.md)
