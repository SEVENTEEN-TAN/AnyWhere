# Phase 2 Testing Guide: Robustness & Smart Wait

**Date**: 2026-01-13
**Status**: Ready for Execution
**Focus**: Verifying the newly implemented "Smart Click" and "Smart Wait" features.

---

## 🧪 Test Objectives

1.  **Verify Click Robustness**: Ensure `MouseActions.clickElement` correctly handles:
    *   Hidden/Obscured elements (should wait or retry).
    *   Disabled elements (should wait for enablement).
    *   Shadow DOM elements (should fallback to JS click).
    *   Target `_blank` links (should handle new tab creation).
2.  **Verify Smart Wait**: Ensure `WaitForHelper` correctly handles:
    *   `waitForCondition`: Waiting for arbitrary JS expressions.
    *   `waitForNetworkIdle`: Waiting for network quiescence.

## 📋 Test Case 1: Shadow DOM Click

**Scenario**: Clicking a button inside a Shadow Root.
**Why**: Verifies `_jsClickFallback` and Shadow DOM detection.

**Steps**:
1.  Navigate to a page with Shadow DOM (e.g., Chrome default pages or a test page).
2.  Execute `click` command on an element inside the shadow root.

**Expected Outcome**:
*   Physical click might fail (or be skipped if coordinates are invalid).
*   Log should show `[JSFallback] Successfully clicked element in Shadow DOM`.
*   Action succeeds.

## 📋 Test Case 2: Obscured/Delayed Element

**Scenario**: Clicking a button that appears or becomes interactive after a delay (simulated).
**Why**: Verifies `_preClickChecks` and `retryOptions`.

**Steps**:
1.  Use `controlManager.execute` with `click` on a UID.
2.  (Simulated) The element starts as `disabled` or `hidden`, then becomes active after 2 seconds.

**Expected Outcome**:
*   The system should NOT fail immediately.
*   Log should show `[PreCheck] Element ... is disabled/not visible, waiting...`.
*   Action succeeds once the element state changes.

## 📋 Test Case 3: Network Idle Wait

**Scenario**: Waiting for a "Load More" action to finish network requests.
**Why**: Verifies `waitForNetworkIdle`.

**Steps**:
1.  Trigger a navigation or action that causes network traffic.
2.  Call `wait_for` with `network_idle` condition (via `WaitForHelper`).

**Expected Outcome**:
*   Function returns only after inflight requests drop to 0 (or threshold).
*   Does not timeout if network clears within limit.

## 📋 Test Case 4: Tab Handling (Regression)

**Scenario**: Clicking a link with `target="_blank"`.
**Why**: Verifies the P2 enhancement in `MouseActions`.

**Steps**:
1.  Click a link that opens a new tab.
2.  Observe context switch.

**Expected Outcome**:
*   System detects `target="_blank"`.
*   Waits for new tab.
*   Automatically switches context to the new tab.

## 🛠️ Execution Plan

Since we don't have a live "Shadow DOM" test site handy, we will create a local HTML file (`tests/fixtures/robustness_test.html`) that simulates these conditions using vanilla JS.

1.  **Create Fixture**: Build an HTML file with:
    *   A Shadow DOM button.
    *   A delayed button (disabled -> enabled after 2s).
    *   A simulated network loader.
    *   A `_blank` link.
2.  **Run Test Script**: Use the Gemini CLI (or a temporary node script) to drive the `BrowserControlManager` against this local file.

---
