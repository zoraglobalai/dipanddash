import { useEffect } from "react";

type Shortcut = {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  action: () => void;
  preventDefault?: boolean;
};

const matchesShortcut = (event: KeyboardEvent, shortcut: Shortcut) =>
  event.key.toLowerCase() === shortcut.key.toLowerCase() &&
  Boolean(event.ctrlKey) === Boolean(shortcut.ctrl) &&
  Boolean(event.altKey) === Boolean(shortcut.alt) &&
  Boolean(event.shiftKey) === Boolean(shortcut.shift);

export const useKeyboardShortcuts = (shortcuts: Shortcut[]) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const matched = shortcuts.find((shortcut) => matchesShortcut(event, shortcut));
      if (!matched) {
        return;
      }

      if (matched.preventDefault !== false) {
        event.preventDefault();
      }
      matched.action();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [shortcuts]);
};

