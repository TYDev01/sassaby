"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Zap, Clock, CreditCard } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentMethodId = "instant" | "same_day" | "standard";

export interface PaymentMethod {
  id: PaymentMethodId;
  label: string;
  description: string;
  fee: string;
  time: string;
  Icon: React.ElementType;
}

export interface PaymentMethodSelectorProps {
  selected: PaymentMethodId | null;
  onSelect: (method: PaymentMethodId) => void;
}

// ─── Static Payment Methods ───────────────────────────────────────────────────

export const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: "instant",
    label: "Instant Transfer",
    description: "Arrive within minutes",
    fee: "1.5%",
    time: "< 5 min",
    Icon: Zap,
  },
  {
    id: "same_day",
    label: "Same Day",
    description: "Processed today",
    fee: "0.8%",
    time: "< 6 hrs",
    Icon: Clock,
  },
  {
    id: "standard",
    label: "Standard",
    description: "1-2 business days",
    fee: "0.3%",
    time: "1-2 days",
    Icon: CreditCard,
  },
];

// ─── Method Option ────────────────────────────────────────────────────────────

function MethodOption({
  method,
  isSelected,
  onClick,
}: {
  method: PaymentMethod;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { Icon } = method;

  return (
    <motion.button
      whileHover={{ backgroundColor: "rgba(255,255,255,0.04)" }}
      role="option"
      aria-selected={isSelected}
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-4 py-3 text-left
        transition-colors duration-150 rounded-lg
        ${isSelected ? "bg-white/5" : ""}
      `}
    >
      {/* Icon */}
      <div
        className={`
          w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border
          ${isSelected
            ? "bg-[#f97316]/10 border-[#f97316]/30 text-[#f97316]"
            : "bg-[#1e1e1e] border-white/10 text-gray-400"}
        `}
      >
        <Icon size={16} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium ${
            isSelected ? "text-white" : "text-gray-300"
          }`}
        >
          {method.label}
        </p>
        <p className="text-xs text-gray-500">{method.description}</p>
      </div>

      {/* Fee + Time */}
      <div className="text-right shrink-0">
        <p className="text-xs text-gray-400 font-medium">{method.fee} fee</p>
        <p className="text-xs text-gray-600">{method.time}</p>
      </div>
    </motion.button>
  );
}

// ─── PaymentMethodSelector ────────────────────────────────────────────────────

export default function PaymentMethodSelector({
  selected,
  onSelect,
}: PaymentMethodSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Resolve selected method object
  const selectedMethod = PAYMENT_METHODS.find((m) => m.id === selected) ?? null;

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function handleSelect(id: PaymentMethodId) {
    onSelect(id);
    setOpen(false);
  }

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut", delay: 0.2 }}
      className="relative w-full"
    >
      {/* Trigger */}
      <motion.button
        whileTap={{ scale: 0.99 }}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select payment method"
        className="
          w-full flex items-center justify-between
          bg-[#111111] border border-white/[0.08]
          rounded-xl px-4 py-3 text-sm
          hover:border-white/20 transition-colors duration-200
          focus:outline-none
        "
      >
        {/* Left side */}
        <div className="flex items-center gap-3">
          {selectedMethod ? (
            <>
              <selectedMethod.Icon
                size={15}
                className="text-[#f97316] shrink-0"
              />
              <span className="text-white">{selectedMethod.label}</span>
            </>
          ) : (
            <span className="text-gray-500">Select payment method</span>
          )}
        </div>

        <ChevronDown
          size={16}
          className={`text-gray-500 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </motion.button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            aria-label="Payment methods"
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="
              absolute left-0 right-0 top-full mt-2 z-50
              bg-[#161616] border border-white/[0.08]
              rounded-xl shadow-2xl overflow-hidden p-1
            "
          >
            {PAYMENT_METHODS.map((method) => (
              <MethodOption
                key={method.id}
                method={method}
                isSelected={selected === method.id}
                onClick={() => handleSelect(method.id)}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
