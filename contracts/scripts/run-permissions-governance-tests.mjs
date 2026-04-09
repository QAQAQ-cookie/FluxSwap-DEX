import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const contractsRoot = path.resolve(__dirname, "..");
const permissionsGovernanceTestDir = path.join(contractsRoot, "test", "permissions-governance");
const tempRootDir = path.join(contractsRoot, ".codex-temp");
const compiledTestDir = path.join(tempRootDir, "permissions-governance-tests");

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

async function collectPermissionsGovernanceTestFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectPermissionsGovernanceTestFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(entryPath);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function formatDiagnostics(diagnostics) {
  return diagnostics
    .map((diagnostic) => {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
      const fileName = diagnostic.file?.fileName ?? "unknown";
      const start = diagnostic.start ?? 0;
      const location = diagnostic.file?.getLineAndCharacterOfPosition(start);
      if (!location) {
        return `${fileName}: ${message}`;
      }

      return `${fileName}:${location.line + 1}:${location.character + 1}: ${message}`;
    })
    .join("\n");
}

async function transpileTestFile(file) {
  const source = await readFile(file, "utf8");
  const relativePath = path.relative(permissionsGovernanceTestDir, file);
  const outputPath = path.join(compiledTestDir, relativePath.replace(/\.ts$/i, ".mjs"));
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      esModuleInterop: true,
      strict: true,
      sourceMap: false,
      inlineSourceMap: false,
    },
    fileName: file,
    reportDiagnostics: true,
  });

  const errors = (result.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0) {
    throw new Error(formatDiagnostics(errors));
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, result.outputText, "utf8");
  return outputPath;
}

async function main() {
  const files = await collectPermissionsGovernanceTestFiles(permissionsGovernanceTestDir);
  if (files.length === 0) {
    throw new Error(`No permissions-governance test files found in ${permissionsGovernanceTestDir}`);
  }

  await rm(compiledTestDir, { recursive: true, force: true });
  try {
    for (const file of files) {
      const compiledFile = await transpileTestFile(file);
      // 逐文件串行执行，避免不同治理专项争抢同一个 Hardhat 运行态。
      await runCommand(process.execPath, [
        "--test",
        "--test-concurrency=1",
        "--experimental-test-isolation=none",
        compiledFile,
      ]);
    }
  } finally {
    await rm(compiledTestDir, { recursive: true, force: true });
    await rm(tempRootDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
