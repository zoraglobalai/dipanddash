import { posStorage } from "@/db/sqlite";

export const settingsRepository = {
  get: (key: string) => posStorage.getSetting(key),
  set: (key: string, value: string) => posStorage.setSetting(key, value)
};

