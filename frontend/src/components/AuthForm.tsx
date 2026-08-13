"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Mail, Lock, User as UserIcon, Phone, Landmark, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import Navbar from "@/components/Navbar";

type Mode = "signin" | "signup";

const MIN_PASSWORD = 10;

function Field({
  icon: Icon,
  trailing,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** Rendered inside the field on the right — the reveal toggle, for passwords. */
  trailing?: React.ReactNode;
}) {
  return (
    <div className="relative">
      <Icon
        size={16}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500"
      />
      <input
        {...props}
        className={`
          w-full rounded-xl bg-[#111] border border-white/10
          pl-10 py-3.5 text-sm text-white placeholder:text-gray-600
          focus:outline-none focus:border-[#f97316]/60 transition-colors
          ${trailing ? "pr-11" : "pr-3.5"}
        `}
      />
      {trailing && (
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2">{trailing}</div>
      )}
    </div>
  );
}

/** Reveal toggle for a password field. */
function RevealToggle({
  shown,
  onToggle,
}: {
  shown: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      // Inside a <form> a bare button submits it — this must never do that.
      type="button"
      onClick={onToggle}
      aria-label={shown ? "Hide password" : "Show password"}
      aria-pressed={shown}
      // Skipped in tab order: it's a convenience, and stopping between the
      // password field and the submit button is more annoying than helpful.
      tabIndex={-1}
      className="
        w-8 h-8 flex items-center justify-center rounded-lg
        text-gray-500 hover:text-white hover:bg-white/10
        transition-colors cursor-pointer
      "
    >
      {shown ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  );
}

export default function AuthForm({ mode }: { mode: Mode }) {
  const isSignUp = mode === "signup";
  const router = useRouter();
  const params = useSearchParams();
  const { signIn, signUp } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  /** Where to land after auth — preserves the page that bounced us here. */
  const next = params.get("next") || "/";

  const canSubmit =
    email.trim().length > 3 &&
    password.length >= (isSignUp ? MIN_PASSWORD : 1) &&
    !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    try {
      if (isSignUp) {
        await signUp({ email, password, fullName, phone, bankAccountName });
        toast.success("Account created");
      } else {
        await signIn(email, password);
        toast.success("Signed in");
      }
      router.push(next);
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
      toast.error(isSignUp ? "Could not create account" : "Could not sign in", {
        description: msg,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative z-10 min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center px-4 pt-28 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-[420px]"
        >
          <div className="text-center mb-7">
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {isSignUp ? "Create your account" : "Welcome back"}
            </h1>
            <p className="text-sm text-gray-500 mt-2">
              {isSignUp
                ? "You'll need an account to trade — it's how we match your payment to your order."
                : "Sign in to place and track orders."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Field
              icon={Mail}
              type="email"
              autoComplete="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <Field
              icon={Lock}
              type={showPassword ? "text" : "password"}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              placeholder={isSignUp ? `Password (${MIN_PASSWORD}+ characters)` : "Password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              trailing={
                <RevealToggle
                  shown={showPassword}
                  onToggle={() => setShowPassword((v) => !v)}
                />
              }
            />

            {isSignUp && (
              <>
                <Field
                  icon={UserIcon}
                  type="text"
                  autoComplete="name"
                  placeholder="Full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
                <Field
                  icon={Phone}
                  type="tel"
                  autoComplete="tel"
                  placeholder="Phone number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <Field
                  icon={Landmark}
                  type="text"
                  placeholder="Name on your bank account"
                  value={bankAccountName}
                  onChange={(e) => setBankAccountName(e.target.value)}
                />
                {/* This is the control, not a formality: a fiat credit is only
                    released against a payment whose sender name matches. */}
                <p className="text-xs text-gray-600 leading-relaxed px-1 -mt-1">
                  Payments must come from an account in this name. Transfers from a
                  third party can&apos;t be released.
                </p>
              </>
            )}

            <motion.button
              type="submit"
              whileHover={canSubmit ? { scale: 1.01 } : {}}
              whileTap={canSubmit ? { scale: 0.99 } : {}}
              disabled={!canSubmit}
              className={`
                mt-2 w-full rounded-xl px-4 py-3.5 text-base font-semibold
                transition-all duration-300 focus:outline-none
                flex items-center justify-center gap-2
                ${
                  canSubmit
                    ? "bg-[#f97316] text-white hover:bg-[#ea6c0e] shadow-lg shadow-[#f97316]/20 cursor-pointer"
                    : "bg-[#1a1a1a] text-gray-600 border border-[#f97316]/20 cursor-not-allowed"
                }
              `}
            >
              {loading && <Loader2 size={18} className="animate-spin shrink-0" />}
              {loading
                ? isSignUp
                  ? "Creating account..."
                  : "Signing in..."
                : isSignUp
                ? "Create account"
                : "Sign in"}
            </motion.button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            {isSignUp ? "Already have an account? " : "New to Sassaby? "}
            <Link
              href={isSignUp ? "/signin" : "/signup"}
              className="text-[#f97316] hover:underline font-medium"
            >
              {isSignUp ? "Sign in" : "Create one"}
            </Link>
          </p>
        </motion.div>
      </main>
    </div>
  );
}
