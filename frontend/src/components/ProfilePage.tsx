"use client";

/**
 * Profile — the minimal KYC fields, and the only place they can be set.
 *
 * This exists because the buy flow refuses to take money from an account with
 * no bank account name on file, and until now the warning pointed at a screen
 * that did not exist. A Google or Apple signup arrives with that field empty by
 * definition — no provider can tell us it — so without this page those accounts
 * could never place a buy order at all.
 *
 * `?next=` carries the page the user was heading for, so finishing the profile
 * returns them there rather than dropping them on the home screen.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, User as UserIcon, Phone, Landmark, Mail, Check } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import Navbar from "@/components/Navbar";

function Field({
  icon: Icon,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="relative">
      <Icon
        size={16}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500"
      />
      <input
        {...props}
        className="
          w-full rounded-xl bg-[#111] border border-white/10
          pl-10 pr-3.5 py-3.5 text-sm text-white placeholder:text-gray-600
          focus:outline-none focus:border-[#f97316]/60 transition-colors
          disabled:opacity-60 disabled:cursor-not-allowed
        "
      />
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, loading: authLoading, updateProfile } = useAuth();

  const next = params.get("next") || "/";

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [saving, setSaving] = useState(false);

  // Populate once the session restore settles. Not keyed on every user change:
  // that would clobber what the person is typing after a background refresh.
  useEffect(() => {
    if (!user) return;
    setFullName(user.fullName);
    setPhone(user.phone);
    setBankAccountName(user.bankAccountName);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!authLoading && !user) router.replace(`/signin?next=${encodeURIComponent("/profile")}`);
  }, [authLoading, user, router]);

  if (authLoading || !user) {
    return (
      <div className="relative z-10 min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={22} className="animate-spin text-gray-600" />
        </div>
      </div>
    );
  }

  /** The one field that gates buying — worth calling out until it is set. */
  const incomplete = !bankAccountName.trim();

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    setSaving(true);
    try {
      await updateProfile({ fullName, phone, bankAccountName });
      toast.success("Profile saved");
      router.push(next);
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
      toast.error("Could not save your profile", { description: msg });
    } finally {
      setSaving(false);
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
              {incomplete ? "Finish your profile" : "Your profile"}
            </h1>
            <p className="text-sm text-gray-500 mt-2">
              {incomplete
                ? "One more detail before you can buy — we match every payment against it."
                : "Keep these current; payments are matched against the name below."}
            </p>
          </div>

          <form onSubmit={handleSave} className="flex flex-col gap-3">
            {/* Email is the account key and is set by the provider or at signup;
                changing it would orphan the linked social identities. */}
            <Field icon={Mail} type="email" value={user.email} disabled readOnly />

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
            <p className="text-xs text-gray-600 leading-relaxed px-1 -mt-1">
              Payments must come from an account in this name. Transfers from a third
              party can&apos;t be released.
            </p>

            <motion.button
              type="submit"
              whileHover={!saving ? { scale: 1.01 } : {}}
              whileTap={!saving ? { scale: 0.99 } : {}}
              disabled={saving}
              className="
                mt-2 w-full rounded-xl px-4 py-3.5 text-base font-semibold
                bg-[#f97316] text-white hover:bg-[#ea6c0e]
                shadow-lg shadow-[#f97316]/20
                disabled:opacity-60 disabled:cursor-not-allowed
                transition-all duration-300 cursor-pointer
                flex items-center justify-center gap-2
              "
            >
              {saving ? (
                <Loader2 size={18} className="animate-spin shrink-0" />
              ) : (
                <Check size={18} className="shrink-0" />
              )}
              {saving ? "Saving..." : "Save and continue"}
            </motion.button>
          </form>

          {/* How you sign in. A social-only account has no password, and knowing
              that is the difference between "forgot password" being useful and
              being a dead end. */}
          <div className="mt-7 pt-5 border-t border-white/10">
            <p className="text-xs text-gray-600 uppercase tracking-wider mb-2">Sign-in methods</p>
            <div className="flex flex-wrap gap-2">
              {user.hasPassword && <Badge>Password</Badge>}
              {user.providers.google && <Badge>Google</Badge>}
              {user.providers.apple && <Badge>Apple</Badge>}
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-3 py-1 rounded-full text-xs text-gray-300 bg-white/5 border border-white/10">
      {children}
    </span>
  );
}
