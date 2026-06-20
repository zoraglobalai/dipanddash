import { app } from "../src/app";

// Vercel invokes this Express application as a serverless function.
// Do not import src/server here: it calls app.listen(), which is only for
// long-running hosts such as DigitalOcean or a local Node process.
export default app;
