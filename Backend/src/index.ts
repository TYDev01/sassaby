import { startChainMonitor } from "./lib/chainMonitor";
import app from "./app";

const PORT = process.env.PORT ?? 4000;
const NODE_ENV = process.env.NODE_ENV ?? "development";

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`\n Sassaby backend running on http://localhost:${PORT} [${NODE_ENV}]`);

  // Start the on-chain deposit monitor (polls Stacks + BTC APIs every 20s)
  startChainMonitor();
});
