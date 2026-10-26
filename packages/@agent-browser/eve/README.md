# @agent-browser/eve

An [eve](https://eve.dev) extension that gives your agent a full browser automation tool set, backed by [agent-browser](https://agent-browser.dev) running inside the agent's sandbox.

Mount it once and the agent gets ~20 namespaced tools — navigation, accessibility snapshots with stable element refs, clicking, form filling, semantic element finding, waiting, screenshots, JavaScript evaluation, tab management, network and console inspection — without writing a single tool by hand.

## Install

For the stable, format-2 extension used with older eve:

```bash
pnpm add @agent-browser/eve@^0.39.4
```

The new-eve distribution is being prepared as `0.40.0-next.0` on the opt-in `next` tag. Once published, install it explicitly with `pnpm add @agent-browser/eve@next`. It requires eve's format-3 extension loader; the provisional peer floor is `>=0.84.0 <1.0.0` and must be confirmed against the actual eve npm release before publishing. Do not upgrade an older eve app to the `next` extension.

`eve` is a peer dependency; the extension runs on the eve installed in your app. The generated manifest is an additional compatibility check, not something an npm peer range can override. Format 2 and format 3 are separate distributions, not a single build that loads on both generations.

## Mount

Create a mount file under `agent/extensions/`. The file name becomes the tool namespace:

```ts
// agent/extensions/browser.ts
import browser from "@agent-browser/eve";

export default browser({});
```

That's it. The agent now has `browser__navigate`, `browser__snapshot`, `browser__click`, and the rest, plus an instructions fragment teaching the model the snapshot-refs workflow.

On first tool use in a fresh sandbox, the extension installs agent-browser (and Chromium plus its system libraries) automatically. For production, pre-install in your sandbox bootstrap instead so sessions start from a warm template:

```ts
// agent/sandbox.ts
import { agentBrowserRevalidationKey, installAgentBrowser } from "@agent-browser/eve/sandbox";
import { defineSandbox } from "eve/sandbox";
import { vercel } from "eve/sandbox/vercel";

export default defineSandbox({
  backend: vercel({ resources: { vcpus: 2 } }),
  revalidationKey: () => agentBrowserRevalidationKey(),
  async bootstrap({ use }) {
    const sandbox = await use();
    await installAgentBrowser(sandbox);
  },
});
```

`@agent-browser/eve/sandbox` also exports `runAgentBrowser` for calling agent-browser from a hand-written eve tool. It uses one default browser session per sandbox; pass `session` when multiple independent browser sessions should share one sandbox.

## Configuration

All fields are optional:

```ts
export default browser({
  // Safety
  allowedDomains: ["example.com", "*.example.com"], // restrict navigation and sub-resources
  caCert: "/etc/ssl/certs/proxy-ca.pem",
  clearCaCert: false,
  useSystemCa: true, // OS trust store for the CLI's own HTTPS requests, such as read
  contentBoundaries: true, // wrap page output in markers the model can recognize
  maxOutputChars: 50_000, // truncate page output

  // Output
  inlineScreenshots: true, // embed screenshots in tool output as data URLs for channels/UIs
  // (hidden from the model via toModelOutput; capped at 4 MB per image)

  // Install behavior
  autoInstall: true, // install agent-browser on first use when missing
  installSpec: "agent-browser@0.31.2", // defaults to the version matching this package
  installBrowser: true, // download Chromium during auto-install
  installSystemDependencies: true, // apt/dnf Chromium libraries during auto-install

  // Session & runtime
  session: undefined, // fixed session name; defaults to one derived from the sandbox id
  sessionPrefix: "eve", // prefix for the derived session name
  binary: "agent-browser", // binary name or path inside the sandbox
  proxy: undefined, // proxy server URL
});
```

## Tools

| Tool | Purpose |
| --- | --- |
| `navigate` | Open a URL, or go back/forward/reload |
| `snapshot` | Accessibility tree with `@eN` element refs (the primary way to see a page) |
| `read` | Page as agent-friendly text/markdown, `llms.txt` aware |
| `click` | Click or double-click an element |
| `fill` | Type into an input (clearing first by default) |
| `press_key` | Press a key or combination (`Enter`, `Control+a`) |
| `hover` | Hover an element |
| `select_option` | Pick a `<select>` option |
| `set_checked` | Check/uncheck a checkbox or radio |
| `scroll` | Scroll the page, a container, or an element into view |
| `drag` | Drag and drop |
| `upload` | Attach sandbox files to a file input |
| `wait_for` | Wait for an element, text, URL pattern, load state, JS condition, or delay |
| `get` | Read text/html/value/attribute/title/url/count/box/styles |
| `find` | Semantic locator: act on an element by role, label, text, placeholder, or test id |
| `screenshot` | Capture the page (full-page and annotated modes); output includes an inline data URL for UIs |
| `evaluate` | Run JavaScript in the page |
| `tabs` | List/open/switch/close tabs (stable ids and labels) |
| `console` | Read console messages and uncaught page errors |
| `network_requests` | List tracked requests or fetch one request's full detail |
| `close` | Close the browser session |

Cookie, storage, and saved-auth-state commands are intentionally not exposed as tools — they make credential material visible to the model. If you need them, add a scoped tool in your own agent (or an [override](#overrides)) with the guardrails your app requires.

## Overrides

Standard eve extension overrides apply. Mount as a directory to gate or replace individual tools:

```ts
// agent/extensions/browser/extension.ts
import browser from "@agent-browser/eve";

export default browser({});
```

```ts
// agent/extensions/browser/tools/evaluate.ts — require approval for raw JS
import { evaluate } from "@agent-browser/eve/tools";
import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";

export default defineTool({ ...evaluate, approval: always() });
```

```ts
// agent/extensions/browser/tools/upload.ts — or drop a tool entirely
import { disableTool } from "eve/tools";

export default disableTool();
```

## How it works

Each tool shells out to the `agent-browser` CLI inside the sandbox from `ctx.getSandbox()`, using an isolated browser session named after the sandbox id, and returns the parsed `--json` payload. The browser and its state live entirely in the sandbox; the app runtime only relays commands.

## Example

See [`examples/eve`](https://github.com/vercel-labs/agent-browser/tree/main/examples/eve) for a complete Next.js eve app with this extension mounted.

## Releasing the eve extension

The eve extension has an independent version from the agent-browser CLI and sandbox. `pnpm version:sync` keeps its sandbox workspace dependency in sync but does not change its version, compiler dependency or publication tag. The sandbox helper still installs the CLI version matching `@agent-browser/sandbox`, not the independent extension version.

Keep format-2 maintenance releases on `0.39.x`, built with the older eve compiler. This branch prepares the format-3 line as `0.40.0-next.0` with `publishConfig.tag: "next"`; publishing it must not move `latest`. Existing exact and caret `0.39.x` consumers do not resolve the `0.40` prerelease. The release workflow checks the extension's exact version on npm independently, so a published `next` version is not repeatedly treated as missing just because `latest` still points at `0.39.x`.

Before merging this release preparation, confirm eve's actual format-3 npm version and adjust the peer floor if needed. Replace the temporary immutable compiler tarball with an exact released eve version, regenerate the lockfile, rebuild and verify the generated format-3 manifest. `builtWithEve` must remain the actual compiler version; do not rewrite it to broaden compatibility. The current development pin is an immutable snapshot of eve main, not an npm release.

Promoting a stable `0.40.0` to `latest` is a separate, deliberate release decision: update both the package version and publication tag, document the eve upgrade requirement, and retain an older branch for any `0.39.x` fixes. Neither this PR nor a package version bump performs that promotion by itself.

## License

Apache-2.0
