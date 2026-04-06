import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const contractsRoot = path.resolve(__dirname, "..");
const unitTestDir = path.join(contractsRoot, "test", "regular", "unit");

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: contractsRoot,
      stdio: "inherit",
      shell: false,
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

async function getUnitTestFiles() {
  const entries = await readdir(unitTestDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => path.join(unitTestDir, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

async function main() {
  const files = await getUnitTestFiles();
  if (files.length === 0) {
    throw new Error(`No unit test files found in ${unitTestDir}`);
  }

  await runCommand(process.execPath, [
    "--import",
    "tsx/esm",
    "--test",
    "--test-concurrency=1",
    "--experimental-test-isolation=none",
    ...files,
  ]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
