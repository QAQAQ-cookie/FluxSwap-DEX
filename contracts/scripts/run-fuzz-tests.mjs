import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const contractsRoot = path.resolve(__dirname, "..");
const fuzzTestDir = path.join(contractsRoot, "test", "fuzz");

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: contractsRoot,
      stdio: "inherit",
      shell: false,
      ...options,
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal !== null) {
        reject(new Error(`Command exited with signal ${signal}: ${command} ${args.join(" ")}`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`Command exited with code ${code}: ${command} ${args.join(" ")}`));
        return;
      }

      resolve();
    });
  });
}

async function getFuzzTestFiles() {
  const entries = await readdir(fuzzTestDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".t.sol"))
    .map((entry) => path.join(fuzzTestDir, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function toWslPath(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  const driveMatch = normalized.match(/^([A-Za-z]):\/(.*)$/);
  if (!driveMatch) {
    return normalized;
  }

  return `/mnt/${driveMatch[1].toLowerCase()}/${driveMatch[2]}`;
}

function shellEscape(value) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

async function canRunForgeDirectly() {
  try {
    await runCommand("forge", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function runForgeMatchPath(relativePath, useDirectForge) {
  if (useDirectForge) {
    await runCommand("forge", ["test", "--match-path", relativePath, "-vv"]);
    return;
  }

  if (process.platform !== "win32") {
    throw new Error("forge is not available in PATH");
  }

  const wslContractsRoot = toWslPath(contractsRoot);
  const command = `cd ${shellEscape(wslContractsRoot)} && forge test --match-path ${shellEscape(relativePath)} -vv`;
  await runCommand("wsl", ["bash", "-lc", command]);
}

async function main() {
  const files = await getFuzzTestFiles();
  if (files.length === 0) {
    throw new Error(`No fuzz test files found in ${fuzzTestDir}`);
  }

  const useDirectForge = await canRunForgeDirectly();
  for (const file of files) {
    const relativePath = toPosixPath(path.relative(contractsRoot, file));
    await runForgeMatchPath(relativePath, useDirectForge);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
