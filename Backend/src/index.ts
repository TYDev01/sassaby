import { startChainMonitor } from "./lib/chainMonitor";
import { startExpirySweep } from "./lib/expirySweep";
import app from "./app";

const PORT = process.env.PORT ?? 4000;
const NODE_ENV = process.env.NODE_ENV ?? "development";

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`\n Sassaby backend running on http://localhost:${PORT} [${NODE_ENV}]`);

  // Watches for client deposits on the sell leg (Stacks + BTC today).
  startChainMonitor();

  // Frees the one-open-order lock on abandoned orders.  Runs independently of
  // the chain monitor because fiat-side orders are never polled on-chain.
  startExpirySweep();
});
