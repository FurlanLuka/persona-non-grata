"use strict";

// Persona Non Grata - GitHub PR comment filter
// Hides timeline items, comments, and review threads from blocked users

(() => {
  let blockedUsers = [];
  let filteringEnabled = true;
  let hideNoise = false;
  let isFiltering = false;
  let fiberWarned = false;

  const HIDDEN_ATTR = "data-png-hidden";
  const COUNTER_ID = "png-hidden-counter";

  function getAuthorFromElement(el) {
    // Classic GitHub view: <a class="author">username</a>
    const authorEl = el.querySelector("a.author");
    if (authorEl) return authorEl.textContent.trim().toLowerCase();

    // React Files Changed view: author link inside ActivityHeader
    const activityHeader = el.querySelector('[class*="ActivityHeader"]');
    if (activityHeader) {
      const link = activityHeader.querySelector('a[href^="/"]');
      if (link) {
        const name = link.textContent.trim().toLowerCase();
        return name.replace(/\[bot\]$/, "");
      }
    }

    // React fiber: collapsed inline review threads store author in fiber props
    return getAuthorFromReactFiber(el);
  }

  function getAuthorFromReactFiber(el) {
    try {
      const target =
        el.querySelector('[class*="ResolvableContainer"]') ||
        el.querySelector('[class*="ReviewThreadContainer"]') ||
        el;

      const fiberKey = Object.keys(target).find(
        (k) =>
          k.startsWith("__reactFiber") ||
          k.startsWith("__reactInternalInstance")
      );
      if (!fiberKey) return null;

      let fiber = target[fiberKey];
      for (let i = 0; i < 10; i++) {
        if (!fiber) break;
        const props = fiber.memoizedProps || {};

        if (props.thread?.commentsData?.comments?.[0]?.author?.login) {
          return props.thread.commentsData.comments[0].author.login
            .toLowerCase()
            .replace(/\[bot\]$/, "");
        }

        fiber = fiber.return;
      }
    } catch (err) {
      if (!fiberWarned) {
        fiberWarned = true;
        console.warn(
          "[Persona Non Grata] React fiber structure changed — inline thread filtering on Files tab may not work.",
          err.message
        );
      }
    }

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

    const text = item.innerText?.substring(0, 300)?.trim() || "";
    const hasCommitIcon = !!item.querySelector(".octicon-git-commit");

    // Any commit-related items (individual or grouped)
    if (hasCommitIcon) return true;

    // Draft toggle: "marked this pull request as draft/ready for review"
    if (text.includes("marked this pull request as")) return true;

    // Title changes
    if (text.includes("changed the title")) return true;

    // Cross-references: "mentioned this pull request"
    if (text.includes("mentioned this pull request")) return true;

    // "requested review from" without approval/changes
    if (
      text.includes("requested review from") &&
      !text.includes("approved") &&
      !text.includes("requested changes")
    ) {
      const hasReviewContent = !!item.querySelector(
        ".js-comment-container .timeline-comment"
      );
      if (!hasReviewContent) return true;
    }

    // Changed base branch
    if (text.includes("changed the base branch")) return true;

    // Resolved/minimized comment placeholders with no visible content
    if (
      text.includes("This comment was marked as resolved") &&
      text.includes("Show comment") &&
      !text.includes("reviewed")
    ) {
      return true;
    }

    return false;
  }

  function filterTimeline() {
    if (isFiltering) return;
    isFiltering = true;
    try {
      runFilter();
    } finally {
      isFiltering = false;
    }
  }

  function runFilter() {
    if (!filteringEnabled) {
      restoreAll();
      updateCounter(0);
      return;
    }

    let hiddenCount = 0;

    // 1. Filter top-level timeline items (.js-timeline-item)
    const timelineItems = document.querySelectorAll(".js-timeline-item");
    for (const item of timelineItems) {
      const author = getAuthorFromElement(item);

      if (isBlocked(author) || isNoiseItem(item)) {
        hideElement(item);
        hiddenCount++;
      } else {
        showElement(item);
        // 2. Filter individual review threads inside non-blocked items
        const threads = item.querySelectorAll(
          ".js-resolvable-timeline-thread-container"
        );
        for (const thread of threads) {
          const threadAuthor = getAuthorFromElement(thread);
          if (isBlocked(threadAuthor)) {
            hideElement(thread);
            hiddenCount++;
          } else {
            showElement(thread);
          }
        }
      }
    }

    // 3. Filter standalone comment containers not inside timeline items
    const standaloneComments = document.querySelectorAll(
      ".js-comment-container:not(.js-timeline-item .js-comment-container)"
    );
    for (const comment of standaloneComments) {
      const author = getAuthorFromElement(comment);
      if (isBlocked(author)) {
        hideElement(comment);
        hiddenCount++;
      } else {
        showElement(comment);
      }
    }

    // 4. Filter review comments on the Files Changed tab
    hiddenCount += filterFilesTabComments();

    updateCounter(hiddenCount);
  }

  function filterFilesTabComments() {
    let count = 0;

    // Classic view: .review-comment, .js-inline-comment-fragment
    const classicComments = document.querySelectorAll(
      ".review-comment, .js-inline-comment-fragment"
    );
    for (const comment of classicComments) {
      const author = getAuthorFromElement(comment);
      if (isBlocked(author)) {
        hideElement(comment);
        count++;
      } else {
        showElement(comment);
      }
    }

    // React Files Changed view
    // Each diff line with comments has an InlineMarkers wrapper containing
    // InlineReviewThread containers. Author extracted from React fiber data.
    const markers = document.querySelectorAll(
      '[class*="InlineMarkers-module__markersWrapper"]'
    );
    for (const marker of markers) {
      const threads = marker.querySelectorAll(
        '[class*="InlineReviewThread-module__ReviewThreadContainer"]'
      );
      if (threads.length === 0) continue;

      let allBlocked = true;
      for (const thread of threads) {
        const author = getAuthorFromElement(thread);
        if (isBlocked(author)) {
          hideElement(thread);
          count++;
        } else {
          showElement(thread);
          allBlocked = false;
        }
      }

      // If all threads in this marker are blocked, hide the whole marker
      if (allBlocked) {
        hideElement(marker);
      } else {
        showElement(marker);
      }
    }

    return count;
  }

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

      // Detect GitHub theme
      const isDark =
        document.documentElement.getAttribute("data-color-mode") === "dark" ||
        document.documentElement.getAttribute("data-dark-theme") != null;
      const bg = isDark ? "#1f2328" : "#ffffff";
      const fg = isDark ? "#e6edf3" : "#1f2328";
      const border = isDark ? "#30363d" : "#d0d7de";

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

  async function loadSettings() {
    try {
      const {
        blockedUsers: users = [],
        filteringEnabled: enabled = true,
        hideNoise: noise = false,
      } = await chrome.storage.sync.get([
        "blockedUsers",
        "filteringEnabled",
        "hideNoise",
      ]);
      blockedUsers = users;
      filteringEnabled = enabled;
      hideNoise = noise;
    } catch (err) {
      console.warn("[Persona Non Grata] Failed to load settings:", err.message);
    }
  }

  async function init() {
    await loadSettings();
    filterTimeline();

    // Re-filter when GitHub dynamically loads content (SPA navigation, lazy loading)
    let debounceTimer = null;
    const observer = new MutationObserver(() => {
      if (isFiltering) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(filterTimeline, 200);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // Single update path: storage changes (from popup, other tabs, or sync)
  chrome.storage.onChanged.addListener(() => {
    loadSettings().then(() => filterTimeline());
  });

  // Handle GitHub SPA navigation (turbo/pjax)
  document.addEventListener("turbo:load", () => {
    loadSettings().then(() => filterTimeline());
  });

  document.addEventListener("pjax:end", () => {
    loadSettings().then(() => filterTimeline());
  });

  init();
})();
