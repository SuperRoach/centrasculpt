# Centra Sculpt

Centra Sculpt is a browser-based 3D sculpting and modelling app for desktop and WebXR. Build with clay brushes, editable primitives and Boolean operations, then save an editable project or export geometry for other tools and 3D printing. It uses TypeScript, Three.js and a signed distance field (SDF) sculpting engine.

## What you can do

- Sculpt with Add, Subtract, Smooth and deformation tools; use masks, colour painting, mirrors and a turntable.
- Assemble editable shapes with transforms, nested layer groups, live Booleans, arrays and procedural tubes.
- Work on desktop or enter VR in a compatible WebXR browser, with controller tools and workspace manipulation.
- Keep editable `.form` projects, use the browser Project Library, and export GLB or STL with print diagnostics.
- Connect a local AI assistant through MCP to inspect the scene, create and modify supported objects, generate enclosures and review proposed changes.

This is an actively developed prototype. Browser checks and automated tests do not establish compatibility or performance on every headset. See [development status](docs/DEVELOPMENT_STATUS.md) for current limits and outstanding hardware validation.

## Why run it yourself?

Self-hosting gives you a local editor you can change and an easy MCP connection to the scene open in your browser. The repository includes the bridge and adapter: start agent mode, register the adapter with your MCP client, and approve access in the editor. There is no separate modelling service to deploy.

The assistant works with the same modelling engine as the editor. It can inspect dimensions and objects, build supported geometry, and return scene previews while you review the result visually. The optional proposal workflow lets you approve an exact plan before it is applied.

Normal editing does not start the agent bridge. Agent mode is for local development on your own machine; it is not a public or multi-user hosted MCP service.

## Quick start

Install **Node.js 22.12+** and npm, then:

```sh
git clone https://github.com/SuperRoach/centrasculpt.git
cd centrasculpt
npm ci
npm run dev
```

Open the address printed by Vite, normally **http://localhost:5173**. Keep the terminal running while you edit.

Start with a brush or open the Shape Library to add geometry. Use the Layers panel to select and organise objects. Save an editable `.form` project before exporting; an exported mesh does not preserve the full editing workflow.

## Connect an AI assistant with MCP

Run this instead of the normal development command:

```sh
npm run dev:agent
```

1. Open the machine `.local` hostname printed in the terminal, the LAN IP shown by Vite if Windows cannot resolve `.local`, or `http://127.0.0.1:5173/` on the Mac itself. The editor and temporary bridge accept those addresses.
2. Configure your MCP client to launch `node` with the **absolute path** to `scripts/agent-mcp.mjs` as its argument. The adapter discovers the running session automatically.
3. In the editor's **Local agent access (development)** panel, choose **Approve connection**. Access starts read-only. Enable **Allow editing (includes Undo)** when you want the assistant to make changes.

For clients using an `mcpServers` configuration:

```json
{
  "mcpServers": {
    "centra_sculpt": {
      "command": "node",
      "args": ["/absolute/path/to/centrasculpt/scripts/agent-mcp.mjs"]
    }
  }
}
```

Replace the example path with your checkout location, then refresh or restart the client's MCP connection. Use an absolute path to Node too if your desktop client cannot find it.

Try asking: “Inspect the current scene and report object dimensions,” or “Propose a small enclosure with a lid, and wait for me to approve the plan in the editor.” Available operations are bounded by the exposed tools; MCP does not expose every manual sculpting gesture.

For reviewed changes, the assistant stages a proposal, you select **Approve this exact plan** in the browser, and the assistant applies that proposal. Connection approval and editing permission are separate from proposal approval. Direct editing tools also exist when editing is enabled.

Only one browser tab owns the bridge at a time. **Revoke access** disconnects access; disabling **Allow editing** removes write permission. Keep session credentials private and keep the bridge local.

See the [MCP setup and tool reference](docs/PHASE_7_3_LOCAL_MCP.md), [proposal workflow](docs/PHASE_7_4_AGENT_PROPOSALS.md) and [visual inspection guide](docs/PHASE_7_4_2_VISUAL_INSPECTION.md) for details and troubleshooting.

## VR and access from another device

The normal development server listens on your network, so another device can open `http://<your-computer-ip>:5173` for desktop-style browser access, subject to hostname and firewall settings.

WebXR requires a secure context. Same-machine localhost can qualify; an ordinary HTTP LAN address does not. For a headset, follow the [Quest setup guide](docs/QUEST_WEBXR.md) or [PCVR guide](docs/PCVR_WEBXR.md). Configured HTTPS development runs with:

```sh
npm run dev:https
```

This uses port **5174** and requires the TLS configuration described in the guides. The headset must trust the certificate issuer; trusting it on your computer alone is insufficient.

## Saves, exports and deployment

Native `.form` saves preserve editable project data. The Project Library uses browser storage, so download project files you want to keep independently of that browser profile. GLB is useful for moving meshes into other 3D software; STL and print diagnostics support printing workflows. See the [printing guide](docs/PHASE_5_3_PRINTING.md).

To build the browser app and inspect the result locally:

```sh
npm run build
npm run preview
```

The browser build is written to `dist/` and can be served by a static web host. Use HTTPS for WebXR. The local MCP bridge belongs to `dev:agent`; deploying `dist/` does not deploy that bridge.

## Useful development commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the browser editor |
| `npm run dev:agent` | Start the editor with the optional local MCP bridge |
| `npm run build` | Type-check and create the production browser build |
| `npm run test:quick` | Run a small smoke test set |
| `npm test -- <substring>` | Run matching test files |
| `npm run check` | Run formatting, lint, strict types, build and the full test suite |
| `npm run example:headless` | Generate a native project and STL diagnostics without a browser |
| `npm run example:enclosure` | Generate a two-part enclosure and print outputs |

See [DEVELOPMENT.md](DEVELOPMENT.md) and the [testing guide](docs/TESTING.md) for contributor workflows. The [modelling API reference](docs/MODELLING_COMMANDS.md) describes programmatic modelling without the MCP transport.

## More information

- [What's new](WHATS_NEW.md)
- [Development status and known limitations](docs/DEVELOPMENT_STATUS.md)
- [Roadmap](docs/ROADMAP.md)
- [Local MCP setup](docs/PHASE_7_3_LOCAL_MCP.md)
- [Quest / WebXR setup](docs/QUEST_WEBXR.md)
