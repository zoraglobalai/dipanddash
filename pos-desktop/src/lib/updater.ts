import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";

import { isTauriRuntime } from "@/lib/tauri";

let hasCheckedForUpdates = false;

export const checkForDesktopUpdates = async (): Promise<void> => {
  if (hasCheckedForUpdates || !isTauriRuntime() || !import.meta.env.PROD) {
    return;
  }

  hasCheckedForUpdates = true;

  try {
    const update = await check();
    if (!update) {
      return;
    }

    const shouldInstall = window.confirm(
      `A new Dip & Dash POS update (${update.version}) is available.\n\nDownload and install now?`
    );

    if (!shouldInstall) {
      return;
    }

    await update.downloadAndInstall();

    const shouldRestart = window.confirm(
      "Update installed successfully. Restart now to apply the new version?"
    );

    if (shouldRestart) {
      await relaunch();
    }
  } catch (error) {
    console.error("Failed to check/install desktop update", error);
  }
};
