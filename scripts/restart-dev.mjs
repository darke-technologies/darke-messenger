import { spawn, execSync } from "node:child_process";
import process from "node:process";

/** Kill a leftover DARKE binary so Cargo can link without a full clean rebuild. */
function killDarke() {
  try {
    execSync("taskkill /IM darke.exe /F", { stdio: "ignore" });
  } catch {
    // Not running.
  }
}

/** Free Vite's port so beforeDevCommand does not die with EADDRINUSE. */
function freeVitePort() {
  try {
    execSync(
      `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 1420 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
      { stdio: "ignore" },
    );
  } catch {
    // Port free or no permission.
  }
}

killDarke();
freeVitePort();
// Brief pause so Windows releases the file lock.
await new Promise((r) => setTimeout(r, 500));

const child = spawn("npx", ["tauri", "dev"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 0));
