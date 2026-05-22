import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, platform } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

/**
 * MCP clients we can configure automatically. Each client's adapter knows
 * how to (a) register the easel MCP server in that client's config file
 * (JSON or TOML) and (b) install the `using-easel` skill where that client
 * looks for skills, if it supports them.
 */
export type ClientName = "claude-desktop" | "cursor" | "windsurf" | "codex";

type ClientSpec = {
  name: ClientName;
  label: string;
  run: () => void;
  postSetup: string;
};

const CLIENTS: Record<ClientName, ClientSpec> = {
  "claude-desktop": {
    name: "claude-desktop",
    label: "Claude Desktop",
    run: () => upsertJsonMcpServer(claudeDesktopConfigPath()),
    postSetup: "Quit and relaunch Claude Desktop to load the MCP server.",
  },
  cursor: {
    name: "cursor",
    label: "Cursor",
    run: () => upsertJsonMcpServer(join(homedir(), ".cursor", "mcp.json")),
    postSetup:
      "Open Cursor and toggle MCP servers in Settings → Features → MCP, " +
      "or restart Cursor for the registration to take effect.",
  },
  windsurf: {
    name: "windsurf",
    label: "Windsurf",
    run: () =>
      upsertJsonMcpServer(join(homedir(), ".codeium", "windsurf", "mcp_config.json")),
    postSetup: "Restart Windsurf to load the MCP server.",
  },
  codex: {
    name: "codex",
    label: "Codex",
    run: () => {
      upsertTomlMcpServer(join(homedir(), ".codex", "config.toml"));
      installEaselSkillTo(join(homedir(), ".codex", "skills", "using-easel"));
    },
    postSetup:
      "Restart Codex to load the MCP server. The using-easel skill has " +
      "been copied to ~/.codex/skills/ so Codex will know when to push.",
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
  spec.run();
  console.log(`[easel] ${spec.label} configured`);
  console.log(`  - ${spec.postSetup}`);
}

/**
 * Installs the easel MCP entry into a JSON config file with the standard
 * `mcpServers: { name: { command, args } }` shape — used by Claude Desktop,
 * Cursor, Windsurf, and friends. Merges into any existing config; preserves
 * sibling top-level keys and other registered MCP servers.
 */
function upsertJsonMcpServer(configPath: string): void {
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
  console.log(`  - wrote ${configPath}`);
}

/**
 * Installs the easel MCP entry into a TOML config file under the
 * `[mcp_servers.easel]` section — used by Codex. Line-based upsert: replaces
 * the existing `[mcp_servers.easel]` block in place if it's there, otherwise
 * appends. Other sections and comments preserved.
 */
function upsertTomlMcpServer(configPath: string): void {
  const newSection =
    "[mcp_servers.easel]\n" +
    'command = "npx"\n' +
    'args = ["-y", "@ammduncan/easel"]\n';

  const existing = existsSync(configPath) ? readFileSync(configPath, "utf-8") : "";
  const updated = upsertTomlSection(existing, "mcp_servers.easel", newSection);
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, updated);
  console.log(`  - wrote ${configPath}`);
}

/**
 * Line-based TOML section upsert. Replaces an existing `[<header>]` block
 * (defined as the lines from the header up to the next top-level `[...]`
 * header or EOF) with `newBlock`; appends if no such block exists. Other
 * sections are left untouched. Adequate for our narrow use case — not a
 * general-purpose TOML editor.
 */
function upsertTomlSection(
  content: string,
  header: string,
  newBlock: string,
): string {
  const targetHeader = `[${header}]`;
  const lines = content.split("\n");
  let startIdx = -1;
  let endIdx = lines.length;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === targetHeader) {
      startIdx = i;
      for (let j = i + 1; j < lines.length; j++) {
        const stripped = lines[j].trim();
        if (/^\[[^\]]+\]$/.test(stripped)) {
          endIdx = j;
          break;
        }
      }
      break;
    }
  }

  const newBlockLines = newBlock.replace(/\n+$/, "").split("\n");
  if (startIdx === -1) {
    const trailing = content.length === 0 || content.endsWith("\n") ? "" : "\n";
    const spacer = content.length === 0 ? "" : "\n";
    return content + trailing + spacer + newBlockLines.join("\n") + "\n";
  }
  const before = lines.slice(0, startIdx);
  const after = lines.slice(endIdx);
  const trailingBlank = after.length > 0 && after[0] !== "" ? [""] : [];
  return [...before, ...newBlockLines, ...trailingBlank, ...after].join("\n");
}

/**
 * Copies the bundled `using-easel/SKILL.md` into a target skills directory.
 * Used by clients that have a skill-discovery mechanism (Claude Code,
 * Codex).
 */
export function installEaselSkillTo(destDir: string): void {
  const src = resolve(PROJECT_ROOT, "skills", "using-easel", "SKILL.md");
  if (!existsSync(src)) {
    console.warn(`  - skipped skill install: source missing at ${src}`);
    return;
  }
  mkdirSync(destDir, { recursive: true });
  copyFileSync(src, join(destDir, "SKILL.md"));
  console.log(`  - installed using-easel skill into ${destDir}`);
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

function claudeDesktopConfigPath(): string {
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
}
