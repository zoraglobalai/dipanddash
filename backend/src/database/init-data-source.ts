import { AppDataSource } from "./data-source";

let initialized = false;

export const initDataSource = async (): Promise<void> => {
  if (initialized) {
    return;
  }

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  initialized = true;
};

