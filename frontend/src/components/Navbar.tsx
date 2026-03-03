"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { User, Bell } from "lucide-react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type NavTab = "transfer" | "history" | "docs";

// ─── Logo ─────────────────────────────────────────────────────────────────────

function StacksBridgeLogo() {
  return (
    <div className="flex items-center gap-2 cursor-pointer select-none">
      {/* Stacked layers icon */}
      <div className="relative w-8 h-8 flex items-center justify-center">
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-8 h-8"
        >
          {/* Orange rounded square background */}
          <rect width="32" height="32" rx="8" fill="#f97316" />
          {/* Stacked layers */}
          <path
            d="M8 20l8 4 8-4"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M8 16l8 4 8-4"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M8 12l8-4 8 4-8 4-8-4z"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>
      <span className="text-white font-semibold text-[15px] tracking-tight">
        Stacks Bridge
      </span>
    </div>
  );
}

// ─── Nav Tab ──────────────────────────────────────────────────────────────────

function NavTab({
  label,
  tabKey,
  activeTab,
  onClick,
}: {
  label: string;
  tabKey: NavTab;
  activeTab: NavTab;
  onClick: (tab: NavTab) => void;
}) {
  const isActive = activeTab === tabKey;

  return (
    <button
      onClick={() => onClick(tabKey)}
      className="relative px-8 py-2.5 text-sm font-medium transition-colors duration-200 focus:outline-none"
    >
      {/* Active border box */}
      {isActive && (
        <motion.div
          layoutId="nav-active-border"
          className="absolute inset-0 rounded-sm border border-[#f97316]"
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}
      <span className={isActive ? "text-white" : "text-gray-400 hover:text-gray-200"}>
        {label}
      </span>
    </button>
  );
}

// ─── Icon Button ──────────────────────────────────────────────────────────────

function IconButton({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
      aria-label={label}
      className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors duration-200 focus:outline-none"
    >
      {children}
    </motion.button>
  );
}

// ─── Navbar ───────────────────────────────────────────────────────────────────

export default function Navbar() {
  const [activeTab, setActiveTab] = useState<NavTab>("transfer");

  const tabs: { label: string; key: NavTab }[] = [
    { label: "Transfer", key: "transfer" },
    { label: "History", key: "history" },
    { label: "Docs", key: "docs" },
  ];

  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="w-full flex items-center justify-between px-6 py-3 bg-[#0a0a0a] border-b border-white/[0.06]"
    >
      {/* Logo */}
      <Link href="/" aria-label="Stacks Bridge home">
        <StacksBridgeLogo />
      </Link>

      {/* Navigation tabs */}
      <nav className="flex items-center gap-1" aria-label="Main navigation">
        {tabs.map(({ label, key }) => (
          <NavTab
            key={key}
            label={label}
            tabKey={key}
            activeTab={activeTab}
            onClick={setActiveTab}
          />
        ))}
      </nav>

      {/* Action icons */}
      <div className="flex items-center gap-1">
        <IconButton label="Account">
          <User size={18} />
        </IconButton>
        <IconButton label="Notifications">
          <Bell size={18} />
        </IconButton>
      </div>
    </motion.header>
  );
}
