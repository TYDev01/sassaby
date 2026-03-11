"use client";

import { motion } from "framer-motion";
import { User, Bell, LayoutDashboard } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

type NavTab = "transfer" | "history";

const TAB_ROUTES: Record<NavTab, string> = {
  transfer: "/",
  history: "/history",
};

// ─── Logo ─────────────────────────────────────────────────────────────────────

function StacksBridgeLogo() {
  return (
    <div className="flex items-center cursor-pointer select-none drop-shadow-xl">
      <Image
        src="/logo.png"
        alt="Sassaby logo"
        width={156}
        height={156}
        className="rounded-xl"
        priority
      />
    </div>
  );
}

// ─── Nav Tab ──────────────────────────────────────────────────────────────────

function NavTab({
  label,
  tabKey,
  activeTab,
}: {
  label: string;
  tabKey: NavTab;
  activeTab: NavTab;
}) {
  const isActive = activeTab === tabKey;
  const href = TAB_ROUTES[tabKey];
  const isExternal = href.startsWith("http");

  return (
    <Link
      href={href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
      className="relative px-4 sm:px-8 py-2.5 text-sm font-medium transition-colors duration-200 focus:outline-none cursor-pointer"
    >
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
    </Link>
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
      className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors duration-200 focus:outline-none cursor-pointer"
    >
      {children}
    </motion.button>
  );
}

// ─── Navbar ───────────────────────────────────────────────────────────────────

export default function Navbar() {
  const pathname = usePathname();
  const isAdmin = pathname === "/admin";

  const activeTab: NavTab =
    pathname === "/history" ? "history" : "transfer";

  const tabs: { label: string; key: NavTab }[] = [
    // { label: "Transfer", key: "transfer" },
    { label: "History", key: "history" },
  ];

  return (
    <div className="w-full flex justify-center px-6  pt-5 fixed top-0 left-0 right-0 z-50">
      <motion.header
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="
          relative
          w-full max-w-[95%] sm:max-w-[80%] lg:max-w-[60%]
          flex items-center justify-between
          px-5 sm:px-5 py-3
          rounded-2xl
          bg-white/[0.04] backdrop-blur-md
          border border-white/[0.08]
          shadow-[0_8px_32px_rgba(0,0,0,0.4)]
          overflow-visible
        "
      >
        {/* Logo — straddles the top edge of the navbar pill */}
        <Link
          href="/"
          aria-label="Sassaby home"
          className="absolute -top-10 left-6 z-50 drop-shadow-[0_10px_20px_rgba(0,0,0,0.6)]"
        >
          <StacksBridgeLogo />
        </Link>

        {/* Spacer to push icons to the right */}
        <div className="flex-1" />

        {/* Action icons — History tab sits right beside the icon buttons */}
        <div className="flex items-center gap-1">
          {tabs.map(({ label, key }) => (
            <NavTab
              key={key}
              label={label}
              tabKey={key}
              activeTab={activeTab}
            />
          ))}
          <Link href="/admin" aria-label="Admin dashboard">
            <motion.div
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.95 }}
              className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors duration-200 cursor-pointer ${
                isAdmin
                  ? "text-[#f97316] bg-[#f97316]/10"
                  : "text-gray-400 hover:text-white hover:bg-white/10"
              }`}
              title="Admin Dashboard"
            >
            <IconButton label="Account">
              <User size={18} />
            </IconButton>
              {/* <LayoutDashboard size={18} /> */}
            </motion.div>
          </Link>
        </div>
      </motion.header>
    </div>
  );
}
