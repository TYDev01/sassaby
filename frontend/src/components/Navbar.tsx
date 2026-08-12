"use client";

import { motion } from "framer-motion";
import { User, LogOut } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

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

// ─── Navbar ───────────────────────────────────────────────────────────────────

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, signOut } = useAuth();

  const isAdmin = pathname === "/admin";

  function handleProfileClick() {
    router.push("/history");
  }

  function handleSignOut() {
    signOut();
    router.push("/");
  }

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

        {/* Signed out shows only "Sign in"; the profile and sign-out icons are
            for an authenticated session. Nothing renders until the session
            restore settles, so neither state flashes on first paint. */}
        <div className="flex items-center gap-1.5">
          {!loading &&
            (user ? (
              <>
                <motion.button
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleProfileClick}
                  aria-label="Your orders"
                  title={user.email}
                  className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors duration-200 cursor-pointer ${
                    isAdmin
                      ? "text-[#f97316] bg-[#f97316]/10"
                      : "text-gray-400 hover:text-white hover:bg-white/10"
                  }`}
                >
                  <User size={18} />
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSignOut}
                  aria-label="Sign out"
                  className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors duration-200 cursor-pointer"
                >
                  <LogOut size={17} />
                </motion.button>
              </>
            ) : (
              <Link
                href={`/signin?next=${encodeURIComponent(pathname)}`}
                className="
                  min-w-[110px] px-7 py-2 rounded-full text-center
                  text-sm font-semibold text-white
                  bg-[#f97316] hover:bg-[#ea6c0e]
                  shadow-lg shadow-[#f97316]/20
                  transition-colors duration-200
                "
              >
                Sign in
              </Link>
            ))}
        </div>
      </motion.header>
    </div>
  );
}

