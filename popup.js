"use strict";

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i;
const MAX_BLOCKED_USERS = 200;

const usernameInput = document.getElementById("username-input");
const addForm = document.getElementById("add-form");
const userList = document.getElementById("user-list");
const emptyState = document.getElementById("empty-state");
const enabledToggle = document.getElementById("enabled-toggle");
const noiseToggle = document.getElementById("noise-toggle");
const refreshBtn = document.getElementById("refresh-btn");
const errorMsg = document.getElementById("error-msg");

function render(usernames) {
  userList.innerHTML = "";
  emptyState.style.display = usernames.length === 0 ? "block" : "none";

  for (const name of usernames) {
    const li = document.createElement("li");

    const span = document.createElement("span");
    span.className = "username";
    span.textContent = name;

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "\u00d7";
    removeBtn.title = `Remove ${name}`;
    removeBtn.addEventListener("click", () => removeUser(name));

    li.append(span, removeBtn);
    userList.appendChild(li);
  }
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.hidden = false;
  setTimeout(() => {
    errorMsg.hidden = true;
  }, 3000);
}

async function loadState() {
  const { blockedUsers = [], filteringEnabled = true, hideNoise = false } =
    await chrome.storage.sync.get([
      "blockedUsers",
      "filteringEnabled",
      "hideNoise",
    ]);
  render(blockedUsers);
  enabledToggle.checked = filteringEnabled;
  noiseToggle.checked = hideNoise;
}

async function addUser(username) {
  const clean = username.trim().replace(/^@/, "").toLowerCase();
  if (!clean) return;

  if (!USERNAME_RE.test(clean)) {
    showError("Invalid GitHub username");
    return;
  }

  const { blockedUsers = [] } = await chrome.storage.sync.get("blockedUsers");

  if (blockedUsers.includes(clean)) {
    showError("Already in list");
    return;
  }

  if (blockedUsers.length >= MAX_BLOCKED_USERS) {
    showError(`Limit of ${MAX_BLOCKED_USERS} users reached`);
    return;
  }

  const updated = [...blockedUsers, clean].sort();
  await chrome.storage.sync.set({ blockedUsers: updated });
  render(updated);
}

async function removeUser(username) {
  const { blockedUsers = [] } = await chrome.storage.sync.get("blockedUsers");
  const updated = blockedUsers.filter((u) => u !== username);
  await chrome.storage.sync.set({ blockedUsers: updated });
  render(updated);
}

async function triggerRefresh() {
  // Touch storage to trigger the content script's storage.onChanged listener
  const { filteringEnabled = true } = await chrome.storage.sync.get("filteringEnabled");
  await chrome.storage.sync.set({ filteringEnabled });
}

addForm.addEventListener("submit", (e) => {
  e.preventDefault();
  addUser(usernameInput.value);
  usernameInput.value = "";
  usernameInput.focus();
});

enabledToggle.addEventListener("change", async () => {
  await chrome.storage.sync.set({ filteringEnabled: enabledToggle.checked });
});

noiseToggle.addEventListener("change", async () => {
  await chrome.storage.sync.set({ hideNoise: noiseToggle.checked });
});

refreshBtn.addEventListener("click", () => {
  triggerRefresh();
});

loadState();
