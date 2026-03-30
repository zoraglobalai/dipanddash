export const logger = {
  info: (message: string, meta?: unknown) => {
    if (meta) {
      // eslint-disable-next-line no-console
      console.log(`[INFO] ${message}`, meta);
      return;
    }
    // eslint-disable-next-line no-console
    console.log(`[INFO] ${message}`);
  },
  error: (message: string, meta?: unknown) => {
    if (meta) {
      // eslint-disable-next-line no-console
      console.error(`[ERROR] ${message}`, meta);
      return;
    }
    // eslint-disable-next-line no-console
    console.error(`[ERROR] ${message}`);
  }
};

