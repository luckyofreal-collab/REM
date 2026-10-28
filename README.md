# REM 1.0 — Chrome extension

REM is a local-first Manifest V3 task and reminder extension. Its source is plain HTML, CSS, JavaScript, and replaceable SVG artwork. All task data stays in `chrome.storage.local`; scheduling uses `chrome.alarms` and a five-minute reconciliation alarm.

## Load in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select this `outputs` folder.
4. Pin REM if you want quick access. Use the extension popup for quick entry or **Open** for the dashboard.

New tasks remain **Not started** until you choose **Start Now**. Acknowledging a reminder does not mark a task complete. Recurring tasks move to their next occurrence when completed. Older missed recurring tasks are represented as a grouped recovery item.

## Features

- Quick task entry and a full dashboard with notes, four priorities, daily/weekly/custom-weekday recurrence, and manual start.
- Thirty-minute prewarning, due reminder, one gentle follow-up after ten minutes, 5/15/30/custom snooze, and separate acknowledgement/completion.
- Quiet hours with critical reminders allowed through, local persistent inbox, badge count, notification fallback, and startup recovery.
- Per-session startup greeting, adjustable moon mascot, restrained float animation, responsive bubble/panel shell, and a center-screen critical overlay on the active supported page.
- Optional gentle chime through an offscreen extension document, JSON export and restore. Replace `assets/mascot.svg` later to change the character art.

## Tests

Open PowerShell or the Codex terminal, change into this `outputs` folder, then run:

```powershell
node --test tests/engine.test.js
```

If Node reports a Windows `spawn EPERM` error, run `node tests/engine.test.js` from the same folder instead. These exercise the browser-independent rules. Chrome APIs, actual OS notifications, and the browser lifecycle require the manual checks below.

## Manual checks on Windows / Chrome

- Create a task, verify it stays pending, select **Start Now**, and reload its tab. Confirm one mascot remains and its placement is the same across tabs.
- Set a task for a minute ahead. Verify notification, inbox entry, badge, Ack, each snooze choice, and completion behave independently.
- Test quiet hours with normal and critical priorities. Verify the critical interruption appears only on the current active web page, and that Chrome internal pages do not show it.
- Let an active reminder pass while Chrome is closed, then reopen Chrome. Verify one startup greeting for that session and priority-first recovery, with older recurring misses grouped.
- Restart Windows with Chrome configured to start on sign-in. Windows notification delivery depends on Chrome background operation and Windows notification settings; REM retains due items in its inbox when the OS notification cannot be shown.
- Export a backup, change or remove tasks, then restore the JSON. Confirm settings and inbox return too.

## Current implementation limits

The Web Store and `chrome://` pages do not allow extension content overlays. The center-screen critical presentation therefore appears only on supported ordinary web pages. Browser-native notification delivery and startup after a full PC shutdown must be verified on the target Windows installation. Mascot positioning is draggable and stored centrally. Notification sound uses a short generated two-note chime when enabled.
