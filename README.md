# Tabfleet Browser for Claude

Tabfleet Browser gives Claude a temporary cloud browser through Tabfleet's remote MCP server. The included skill guides Claude through checking available browser time, navigating pages, using fresh page snapshots, sharing a short-lived live view, and closing sessions. It works in Claude chat, Cowork, and Claude Code after the user connects the Tabfleet connector.

## Connect and use

Install the plugin and connect **Tabfleet** on its Connectors tab. Tabfleet asks you to sign in with Google, select a workspace, and approve either view-only or browser-control access. A new workspace has a trial allowance; `get_usage` shows the current balance and limits. The plugin contains no credentials, local executable, or install script. Its `.mcp.json` connects only to `https://tabfleet.com/` using Streamable HTTP and OAuth. In Claude Code it also adds the fleet pane described below.

Try these prompts:

- “Open this page in a cloud browser and summarize what is visible: https://example.com.”
- “Check this site's contact form and tell me which fields it requires. Don't submit it.”
- “Open a browser on this page and give me a live view link so I can watch.”

## Install in Claude Code

```
/plugin marketplace add tabfleet/claude-plugin
/plugin install tabfleet-browser@tabfleet
```

Then run `/mcp`, choose the Tabfleet server, and sign in.

## Fleet pane in Claude Code

In Claude Code the plugin adds a fleet pane and commands on top of the connector:

- `/fleet` opens a pane listing your active browsers with minutes left, a live view link, and Close buttons.
- `/fleet-watch` shows the newest active browser's screen inside the pane, refreshed every couple of seconds.
- `/fleet-close-all` closes every active browser in the workspace.
- While browsers are running, the status line shows how many and the minutes left.
- When a Claude Code session ends, it closes the browsers that session launched, so unused minutes go back to your allowance. Browsers launched elsewhere stay open.

### What the fleet pane runs and sends

The pane calls Tabfleet tools itself, without the model asking, only through this plugin's own Tabfleet server (`https://tabfleet.com/`):

| Tool | When |
| --- | --- |
| `list_sessions`, `get_usage` | When you run `/fleet`, `/fleet-watch` or `/fleet-close-all`, press Refresh, after any Tabfleet tool call, and every 20 seconds while a browser is running |
| `get_live_view` | After the model launches a browser, or when you press Live view; asks for a 15-minute view-only link |
| `browser_screenshot` | Every 1.5 seconds while you are watching a browser, as a PNG |
| `close_browser` | When you press Close or run `/fleet-close-all`, and at session end for browsers that session launched |

What it sends is limited to browser session IDs and those fixed arguments. It does not read or send your conversation, files, or anything else from your machine, it starts no programs, and it writes no files: screenshots are drawn in the pane from memory.

Its hooks see Claude Code's tool calls only to notice Tabfleet ones. Every call passes through unchanged. After `launch_browser` the pane remembers the new session and fetches its live view link. After any other Tabfleet tool it refreshes the list. Other tools are ignored.

Browser-control access also allows Claude to click and fill pages for tasks you authorize. A live view link is a temporary bearer credential; anyone with the link can see its browser, and a control link also permits input. Page contents and actions travel through Tabfleet's browser service. Tabfleet does not retain screenshots, snapshots, or live streams as application records; it keeps account, authorization, session, and usage records as described in the [privacy notice](https://tabfleet.com/privacy). Websites opened in the browser receive traffic under their own policies. Browser sessions are temporary and consume minutes from the workspace allowance.

The service is operated by Dalton Solutions, LLC. See the [Tabfleet documentation](https://tabfleet.com/docs), [terms](https://tabfleet.com/terms), and [privacy notice](https://tabfleet.com/privacy). For support or security reports, email [support@tabfleet.com](mailto:support@tabfleet.com).
