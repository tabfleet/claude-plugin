# Tabfleet Browser for Claude

Tabfleet Browser gives Claude a temporary cloud browser through Tabfleet's remote MCP server. The included skill guides Claude through checking available browser time, navigating pages, using fresh page snapshots, sharing a short-lived live view, and closing sessions. It works in Claude chat, Cowork, and Claude Code after the user connects the Tabfleet connector.

## Connect and use

Install the plugin and connect **Tabfleet** on its Connectors tab. Tabfleet asks you to sign in with Google, select a workspace, and approve either view-only or browser-control access. A new workspace has a trial allowance; `get_usage` shows the current balance and limits. The plugin contains no credentials, local executable, or install script. Its `.mcp.json` connects only to `https://tabfleet.com/` using Streamable HTTP and OAuth.

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

For a pane that lists your browsers, shows their screens, and closes them when a session ends, install the separate [Tabfleet Fleet Pane](https://github.com/tabfleet/claude-code-fleet) plugin: `/plugin install tabfleet-fleet@tabfleet`.

Browser-control access also allows Claude to click and fill pages for tasks you authorize. A live view link is a temporary bearer credential; anyone with the link can see its browser, and a control link also permits input. Page contents and actions travel through Tabfleet's browser service. Tabfleet does not retain screenshots, snapshots, or live streams as application records; it keeps account, authorization, session, and usage records as described in the [privacy notice](https://tabfleet.com/privacy). Websites opened in the browser receive traffic under their own policies. Browser sessions are temporary and consume minutes from the workspace allowance.

The service is operated by Dalton Solutions, LLC. See the [Tabfleet documentation](https://tabfleet.com/docs), [terms](https://tabfleet.com/terms), and [privacy notice](https://tabfleet.com/privacy). For support or security reports, email [support@tabfleet.com](mailto:support@tabfleet.com).
