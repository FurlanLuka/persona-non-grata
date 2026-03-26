"use strict";

// Persona Non Grata - GitHub PR comment filter
// Hides timeline items, comments, and review threads from blocked users

(() => {
  let blockedUsers = [];
  let filteringEnabled = true;
  let hideNoise = false;
  let showStats = false;
  let isFiltering = false;

  const HIDDEN_ATTR = "data-png-hidden";
  const COUNTER_ID = "png-hidden-counter";
  const STATS_ID = "png-stats-box";

  function getAuthorFromElement(el) {
    const authorEl = el.querySelector("a.author");
    if (authorEl) return authorEl.textContent.trim().toLowerCase();
    return null;
  }

  function hideElement(el) {
    if (el.getAttribute(HIDDEN_ATTR)) return false;
    el.setAttribute(HIDDEN_ATTR, "true");
    el.style.setProperty("display", "none", "important");
    return true;
  }

  function showElement(el) {
    if (!el.getAttribute(HIDDEN_ATTR)) return;
    el.removeAttribute(HIDDEN_ATTR);
    el.style.removeProperty("display");
  }

  function isBlocked(username) {
    if (!username) return false;
    return blockedUsers.includes(username.toLowerCase());
  }

  function isNoiseItem(item) {
    if (!hideNoise) return false;

    // Detect by DOM structure — not text matching — to avoid false positives
    // and show/hide loops.

    // Commits (individual or grouped)
    if (item.querySelector(".octicon-git-commit")) return true;

    // Force pushes
    if (item.querySelector(".octicon-repo-push")) return true;

    // Items with no comment body are status events (draft toggle, title change,
    // review requests, branch changes, cross-references, etc.)
    // Keep items that have actual review/comment content.
    const hasCommentBody = !!item.querySelector(
      ".timeline-comment, .js-comment-container .comment-body"
    );
    const hasReviewThreads = item.querySelectorAll(
      ".js-resolvable-timeline-thread-container"
    ).length > 0;
    const isApproval =
      !!item.querySelector(".octicon-check") ||
      !!item.querySelector(".octicon-file-diff");

    // If it has a comment body, review threads, or is an approval — keep it
    if (hasCommentBody || hasReviewThreads || isApproval) return false;

    // Everything else without comment content is noise
    // (title changes, draft toggles, review requests, branch changes,
    //  cross-references, resolved placeholders, label changes, etc.)
    const hasAuthor = !!item.querySelector("a.author");
    const isCondensed = !!item.querySelector(".TimelineItem--condensed");

    // Condensed items without comments are always noise
    if (isCondensed) return true;

    // Non-condensed items without any comment body — check if it's a
    // review event (has the eye icon = "reviewed") which we want to keep
    const hasEyeIcon = !!item.querySelector(".octicon-eye");
    if (hasEyeIcon) return false;

    // Remaining items without comment content are noise
    if (hasAuthor && !hasCommentBody) return true;

    return false;
  }

  // --- Stats ---

  function createStats() {
    return {
      totalItems: 0,
      hiddenByUser: {},
      noiseHidden: 0,
      threadsHidden: 0,
      visible: 0,
    };
  }

  function recordHidden(stats, author, isNoise) {
    if (isNoise) {
      stats.noiseHidden++;
    } else if (author) {
      stats.hiddenByUser[author] = (stats.hiddenByUser[author] || 0) + 1;
    }
  }

  // --- Filtering ---

  function filterTimeline() {
    if (isFiltering) return;
    isFiltering = true;
    // Disconnect observer so our own DOM changes don't retrigger filtering
    if (observer) observer.disconnect();
    try {
      runFilter();
    } finally {
      isFiltering = false;
      if (observer) {
        observer.observe(document.body, { childList: true, subtree: true });
      }
    }
  }

  function runFilter() {
    if (!filteringEnabled) {
      restoreAll();
      removeStatsBox();
      updateCounter(0);
      return;
    }

    const stats = createStats();
    let hiddenCount = 0;

    // 1. Filter top-level timeline items
    const timelineItems = document.querySelectorAll(".js-timeline-item");
    stats.totalItems = timelineItems.length;

    for (const item of timelineItems) {
      const author = getAuthorFromElement(item);
      const noise = isNoiseItem(item);

      if (isBlocked(author) || noise) {
        hideElement(item);
        hiddenCount++;
        recordHidden(stats, author, noise && !isBlocked(author));
      } else {
        showElement(item);
        stats.visible++;
        // Filter review threads inside non-blocked items
        const threads = item.querySelectorAll(
          ".js-resolvable-timeline-thread-container"
        );
        for (const thread of threads) {
          const threadAuthor = getAuthorFromElement(thread);
          if (isBlocked(threadAuthor)) {
            hideElement(thread);
            hiddenCount++;
            stats.threadsHidden++;
            recordHidden(stats, threadAuthor, false);
          } else {
            showElement(thread);
          }
        }
      }
    }

    // 2. Filter standalone comment containers
    const standaloneComments = document.querySelectorAll(
      ".js-comment-container:not(.js-timeline-item .js-comment-container)"
    );
    for (const comment of standaloneComments) {
      const author = getAuthorFromElement(comment);
      if (isBlocked(author)) {
        hideElement(comment);
        hiddenCount++;
        recordHidden(stats, author, false);
      } else {
        showElement(comment);
      }
    }

    updateCounter(hiddenCount);

    if (showStats) {
      renderStatsBox(stats, hiddenCount);
    } else {
      removeStatsBox();
    }
  }

  // --- Stats box ---

  function renderStatsBox(stats, hiddenCount) {
    if (hiddenCount === 0) {
      removeStatsBox();
      return;
    }

    // Only render on PR conversation pages
    const discussion = document.querySelector(".js-discussion");
    if (!discussion) return;

    let box = document.getElementById(STATS_ID);
    if (!box) {
      box = document.createElement("div");
      box.id = STATS_ID;

      const firstChild = discussion.firstElementChild;
      if (firstChild?.nextElementSibling) {
        firstChild.after(box);
      } else {
        discussion.prepend(box);
      }
    }

    const cs = getComputedStyle(document.documentElement);
    const v = (name) => cs.getPropertyValue(name).trim();

    const bg = v("--bgColor-muted") || "#f6f8fa";
    const fg = v("--fgColor-default") || "#1f2328";
    const fgMuted = v("--fgColor-muted") || "#656d76";
    const borderColor = v("--borderColor-default") || "#d0d7de";
    const accent = v("--fgColor-accent") || "#0969da";
    const red = v("--fgColor-danger") || "#d1242f";
    const green = v("--fgColor-success") || "#1a7f37";

    const userEntries = Object.entries(stats.hiddenByUser).sort(
      (a, b) => b[1] - a[1]
    );

    const userRows = userEntries
      .map(
        ([user, count]) =>
          `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;margin-bottom:2px;">` +
          `<span style="color:${red};font-weight:600;">@${escapeHtml(user)}</span>` +
          `<span style="color:${fgMuted};">${count}</span>` +
          `</span>`
      )
      .join("");

    const totalBlockedComments = userEntries.reduce((s, [, c]) => s + c, 0);

    const metaParts = [
      totalBlockedComments > 0
        ? `<span>${totalBlockedComments} from blocked users</span>`
        : "",
      stats.noiseHidden > 0 ? `<span>${stats.noiseHidden} noise</span>` : "",
      stats.threadsHidden > 0
        ? `<span>${stats.threadsHidden} inline threads</span>`
        : "",
    ]
      .filter(Boolean)
      .join('<span style="opacity:0.4;"> · </span>');

    box.innerHTML =
      `<div class="TimelineItem" style="padding:0;margin:0 0 16px;">` +
      `<div class="TimelineItem-body my-0" style="` +
      `background:${bg};border:1px solid ${borderColor};border-radius:6px;padding:12px 16px;` +
      `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">` +
      `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">` +
      `<svg width="16" height="16" viewBox="0 0 16 16" fill="${accent}"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z"/></svg>` +
      `<span style="font-weight:600;font-size:13px;color:${fg};">Persona Non Grata</span>` +
      `<span style="font-size:12px;color:${fgMuted};">filtering summary</span>` +
      `</div>` +
      `<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:13px;color:${fg};` +
      `${userRows || metaParts ? "margin-bottom:6px;" : ""}">` +
      `<span><strong style="color:${red};">${hiddenCount}</strong> hidden</span>` +
      `<span><strong style="color:${green};">${stats.visible}</strong> visible</span>` +
      `</div>` +
      (metaParts
        ? `<div style="font-size:12px;color:${fgMuted};${userRows ? "margin-bottom:6px;" : ""}">${metaParts}</div>`
        : "") +
      (userRows
        ? `<div style="display:flex;flex-wrap:wrap;font-size:12px;">${userRows}</div>`
        : "") +
      `</div></div>`;
  }

  function removeStatsBox() {
    const box = document.getElementById(STATS_ID);
    if (box) box.remove();
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Counter badge ---

  function restoreAll() {
    const hidden = document.querySelectorAll(`[${HIDDEN_ATTR}]`);
    for (const el of hidden) {
      showElement(el);
    }
  }

  function updateCounter(count) {
    let counter = document.getElementById(COUNTER_ID);

    if (count === 0) {
      if (counter) counter.remove();
      return;
    }

    if (!counter) {
      counter = document.createElement("div");
      counter.id = COUNTER_ID;

      const cs = getComputedStyle(document.documentElement);
      const bg = cs.getPropertyValue("--bgColor-default").trim() || "#ffffff";
      const fg = cs.getPropertyValue("--fgColor-default").trim() || "#1f2328";
      const border =
        cs.getPropertyValue("--borderColor-default").trim() || "#d0d7de";

      Object.assign(counter.style, {
        position: "fixed",
        bottom: "16px",
        right: "16px",
        background: bg,
        color: fg,
        padding: "8px 12px",
        borderRadius: "8px",
        fontSize: "12px",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
        zIndex: "9999",
        border: `1px solid ${border}`,
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        cursor: "default",
        userSelect: "none",
      });
      document.body.appendChild(counter);
    }

    counter.textContent = `PNG: ${count} hidden`;
  }

  // --- Settings & Init ---

  async function loadSettings() {
    try {
      const {
        blockedUsers: users = [],
        filteringEnabled: enabled = true,
        hideNoise: noise = false,
        showStats: statsOn = false,
      } = await chrome.storage.sync.get([
        "blockedUsers",
        "filteringEnabled",
        "hideNoise",
        "showStats",
      ]);
      blockedUsers = users;
      filteringEnabled = enabled;
      hideNoise = noise;
      showStats = statsOn;
    } catch (err) {
      console.warn("[Persona Non Grata] Failed to load settings:", err.message);
    }
  }

  let debounceTimer = null;
  let observer = null;

  function startObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      if (isFiltering) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(filterTimeline, 200);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  async function init() {
    await loadSettings();
    filterTimeline();
    startObserver();
  }

  chrome.storage.onChanged.addListener(() => {
    loadSettings().then(() => filterTimeline());
  });

  // GitHub SPA navigation replaces document.body, which disconnects
  // the MutationObserver. Re-attach it after each navigation.
  document.addEventListener("turbo:load", () => {
    loadSettings().then(() => {
      filterTimeline();
      startObserver();
    });
  });

  document.addEventListener("pjax:end", () => {
    loadSettings().then(() => {
      filterTimeline();
      startObserver();
    });
  });

  init();
})();
