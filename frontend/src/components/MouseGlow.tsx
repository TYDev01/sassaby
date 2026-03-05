"use client";

import { useEffect, useRef } from "react";

export default function MouseGlow() {
  const glowRef = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });
  const rafId = useRef<number>(0);

  useEffect(() => {
    const glow = glowRef.current;
    if (!glow) return;

    function handleMouseMove(e: MouseEvent) {
      pos.current = { x: e.clientX, y: e.clientY };
      glow!.style.opacity = "1";
    }

    function handleMouseLeave() {
      glow!.style.opacity = "0";
    }

    function animate() {
      // Lerp current position toward mouse — lower factor = slower/lazier
      const lerp = 0.06;
      current.current.x += (pos.current.x - current.current.x) * lerp;
      current.current.y += (pos.current.y - current.current.y) * lerp;

      glow!.style.left = `${current.current.x}px`;
      glow!.style.top = `${current.current.y}px`;

      rafId.current = requestAnimationFrame(animate);
    }

    rafId.current = requestAnimationFrame(animate);
    window.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      cancelAnimationFrame(rafId.current);
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  return (
    <div
      ref={glowRef}
      aria-hidden="true"
      className="pointer-events-none fixed z-0 opacity-0 transition-opacity duration-500"
      style={{
        width: "1000px",
        height: "1000px",
        transform: "translate(-50%, -50%)",
        background:
          "radial-gradient(circle, rgba(249,115,22,0.07) 0%, rgba(249,115,22,0.03) 40%, transparent 70%)",
        borderRadius: "50%",
      }}
    />
  );
}
