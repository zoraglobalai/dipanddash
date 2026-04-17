import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";

import { isTauriRuntime } from "@/lib/tauri";

let hasCheckedForUpdates = false;

export type UpdateConfirmInput = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
};

export type UpdateConfirmHandler = (input: UpdateConfirmInput) => Promise<boolean>;

export const checkForDesktopUpdates = async (requestConfirm?: UpdateConfirmHandler): Promise<void> => {
  if (hasCheckedForUpdates || !isTauriRuntime() || !import.meta.env.PROD) {
    return;
  }

  hasCheckedForUpdates = true;

  try {
    const update = await check();
    if (!update) {
      return;
    }

    if (!requestConfirm) {
      return;
    }

    const shouldInstall = await requestConfirm({
      title: "POS Update Available",
      description: `A new Dip & Dash POS update (${update.version}) is available. Download and install now?`,
      confirmLabel: "Install Now",
      cancelLabel: "Later"
    });

    if (!shouldInstall) {
      return;
    }

    await update.downloadAndInstall();

    const shouldRestart = await requestConfirm({
      title: "Restart Required",
      description: "Update installed successfully. Restart now to apply the new version?",
      confirmLabel: "Restart Now",
      cancelLabel: "Not Now"
    });

    if (shouldRestart) {
      await relaunch();
    }
  } catch (error) {
    console.error("Failed to check/install desktop update", error);
  }
};
