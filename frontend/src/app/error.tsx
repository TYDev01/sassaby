"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Global Error Boundary]", error);
  }, [error]);

  return (
    <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-6 max-w-sm"
      >
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <AlertTriangle size={28} className="text-red-400" />
        </div>
        <div>
          <h1 className="text-white text-xl font-bold mb-2">Something went wrong</h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            An unexpected error occurred. This is usually a temporary issue.
          </p>
        </div>
        <button
          onClick={reset}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#f97316] text-white text-sm font-semibold hover:bg-[#ea6c0e] transition-colors cursor-pointer"
        >
          <RefreshCw size={14} />
          Try again
        </button>
      </motion.div>
    </div>
  );
}
