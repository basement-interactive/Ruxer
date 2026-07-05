const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { open } = window.__TAURI__.dialog;

const logEl = document.getElementById("log");
const repoPathEl = document.getElementById("repoPath");
const taskStatusEl = document.getElementById("taskStatus");
const wslDot = document.getElementById("wslDot");
const wslText = document.getElementById("wslText");

const buildWindowsBtn = document.getElementById("buildWindows");
const buildLinuxBtn = document.getElementById("buildLinux");
const zipWindowsBtn = document.getElementById("zipWindows");
const zipLinuxBtn = document.getElementById("zipLinux");
const publishBtn = document.getElementById("publishRelease");
const pickRepoBtn = document.getElementById("pickRepo");

const allButtons = [buildWindowsBtn, buildLinuxBtn, zipWindowsBtn, zipLinuxBtn, publishBtn];

let repoRoot = null;
let wslOk = false;

function appendLog(stream, text) {
  const line = document.createElement("div");
  line.className = `line-${stream}`;
  line.textContent = text;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

function setBusy(busy) {
  for (const b of allButtons) b.disabled = busy || !repoRoot;
  buildLinuxBtn.disabled = buildLinuxBtn.disabled || !wslOk;
  taskStatusEl.textContent = busy ? "Running..." : "Idle";
}

async function refreshWsl() {
  wslOk = await invoke("check_wsl");
  wslDot.className = "status-dot " + (wslOk ? "ok" : "warn");
  wslText.textContent = wslOk
    ? "WSL2 detected — Linux build available."
    : "WSL2 not detected. Install it and a distro with Tauri's Linux deps to enable the Linux build.";
  buildLinuxBtn.disabled = !wslOk || !repoRoot;
}

async function refreshRepo() {
  try {
    repoRoot = await invoke("detect_repo_root");
    repoPathEl.textContent = repoRoot;
    repoPathEl.title = repoRoot;
  } catch (err) {
    repoRoot = null;
    repoPathEl.textContent = String(err);
  }
  setBusy(false);
}

async function runTask(cmd, args, label) {
  appendLog("info", `--- ${label} ---`);
  setBusy(true);
  try {
    await invoke(cmd, args);
  } catch (err) {
    // build-done event already logged the failure reason; this just avoids
    // an unhandled rejection in devtools.
  }
}

buildWindowsBtn.addEventListener("click", () =>
  runTask("build_windows", { repoRoot }, "Build Windows"),
);
buildLinuxBtn.addEventListener("click", () =>
  runTask("build_linux", { repoRoot }, "Build Linux (WSL2)"),
);
zipWindowsBtn.addEventListener("click", () =>
  runTask("zip_release", { repoRoot, platform: "windows" }, "Zip Windows release"),
);
zipLinuxBtn.addEventListener("click", () =>
  runTask("zip_release", { repoRoot, platform: "linux" }, "Zip Linux release"),
);
publishBtn.addEventListener("click", () =>
  runTask("publish_release", { repoRoot }, "Publish release (GitHub)"),
);

pickRepoBtn.addEventListener("click", async () => {
  const selected = await open({ directory: true, multiple: false, title: "Select fluxer-rust repo root" });
  if (selected) {
    repoRoot = selected;
    repoPathEl.textContent = repoRoot;
    setBusy(false);
  }
});

listen("build-log", (event) => {
  appendLog(event.payload.stream, event.payload.text);
});

listen("build-done", (event) => {
  const { ok, message } = event.payload;
  appendLog(ok ? "info" : "error", message);
  setBusy(false);
});

refreshRepo();
refreshWsl();
