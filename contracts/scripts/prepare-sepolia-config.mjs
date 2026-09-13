import { access, copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { privateKeyToAccount } from "viem/accounts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const parameterDirectory = path.join(projectRoot, "ignition", "parameters");
const envPath = path.join(projectRoot, ".env");
const configFiles = [
  ["FluxCore.sepolia.sample.json5", "FluxCore.sepolia.local.json5"],
  ["post-deploy-init.sepolia.sample.json5", "post-deploy-init.sepolia.local.json5"],
];

try {
  await access(envPath);
  process.loadEnvFile(envPath);
} catch {
  // The files can still be copied before the local deployment environment is configured.
}

const privateKey = process.env.SEPOLIA_PRIVATE_KEY;
const deployerAddress =
  privateKey === undefined || privateKey.length === 0
    ? undefined
    : privateKeyToAccount(privateKey).address;

for (const [templateName, localName] of configFiles) {
  const templatePath = path.join(parameterDirectory, templateName);
  const localPath = path.join(parameterDirectory, localName);

  try {
    await access(localPath);
    console.log(`Keep existing ${localName}`);
  } catch {
    await copyFile(templatePath, localPath);
    console.log(`Created ${localName}`);
  }

  if (deployerAddress === undefined) {
    continue;
  }

  let content = await readFile(localPath, "utf8");
  content = content
    .replaceAll("0x1111111111111111111111111111111111111111", deployerAddress)
    .replaceAll("0x2222222222222222222222222222222222222222", deployerAddress)
    .replaceAll("0x3333333333333333333333333333333333333333", deployerAddress)
    .replaceAll("0x4444444444444444444444444444444444444444", deployerAddress);

  if (localName === "FluxCore.sepolia.local.json5") {
    content = content.replace("deployMockWeth: false", "deployMockWeth: true");
  } else {
    content = content.replace(/^\s*weth:\s*"0x0000000000000000000000000000000000000000",\r?\n/m, "");
  }

  await writeFile(localPath, content, "utf8");
  console.log(`Configured ${localName} for deployer ${deployerAddress}`);
}

if (deployerAddress === undefined) {
  console.log("Set SEPOLIA_PRIVATE_KEY in .env, then run this command again to configure the local files.");
} else {
  console.log("MockWETH will be deployed and all initial roles will use the deployer wallet.");
}
