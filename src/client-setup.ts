import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir, platform } from "node:os";

/**
 * MCP clients we can configure automatically. Each client stores its MCP
 * registrations in a JSON file with an `mcpServers` map keyed by server name,
 * where each entry has `{ command, args }`. So one writer covers all of them
 * — we only need to know the config file path per client.
 */
export type ClientName = "claude-desktop" | "cursor" | "windsurf";

type ClientSpec = {
  name: ClientName;
  label: string;
  configPath: () => string;
  /** Human-readable next step for the user after we write. */
  postSetup: string;
};

const CLIENTS: Record<ClientName, ClientSpec> = {
  "claude-desktop": {
    name: "claude-desktop",
    label: "Claude Desktop",
    configPath: () => {
      const home = homedir();
      if (platform() === "darwin") {
        return join(
          home,
          "Library",
          "Application Support",
          "Claude",
          "claude_desktop_config.json",
        );
      }
      if (platform() === "win32") {
        const appData = process.env.APPDATA ?? join(home, "AppData", "Roaming");
        return join(appData, "Claude", "claude_desktop_config.json");
      }
      return join(home, ".config", "Claude", "claude_desktop_config.json");
    },
    postSetup: "Quit and relaunch Claude Desktop to load the MCP server.",
  },
  cursor: {
    name: "cursor",
    label: "Cursor",
    configPath: () => join(homedir(), ".cursor", "mcp.json"),
    postSetup:
      "Open Cursor and toggle MCP servers in Settings → Features → MCP, " +
      "or restart Cursor for the registration to take effect.",
  },
  windsurf: {
    name: "windsurf",
    label: "Windsurf",
    configPath: () =>
      join(homedir(), ".codeium", "windsurf", "mcp_config.json"),
    postSetup: "Restart Windsurf to load the MCP server.",
  },
};

export function listClients(): readonly ClientName[] {
  return Object.keys(CLIENTS) as ClientName[];
}

export function setupClient(name: ClientName): void {
  const spec = CLIENTS[name];
  if (!spec) {
    throw new Error(`unknown client: ${name}`);
  }
  const configPath = spec.configPath();
  const config = readJson(configPath);

  const mcpServers =
    (config.mcpServers as Record<string, unknown> | undefined) ?? {};
  mcpServers.easel = {
    command: "npx",
    args: ["-y", "@ammduncan/easel"],
  };
  config.mcpServers = mcpServers;

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  console.log(`[easel] ${spec.label} configured`);
  console.log(`  - wrote ${configPath}`);
  console.log(`  - ${spec.postSetup}`);
}

function readJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    const text = readFileSync(path, "utf-8").trim();
    if (!text) return {};
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch (err) {
    throw new Error(
      `couldn't parse existing config at ${path}: ${(err as Error).message}`,
    );
  }
}
