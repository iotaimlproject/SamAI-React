import * as React from "react"
import { cn } from "@/lib/utils"

export function Led({ label, on, variant = "default", size = "default" }: { label: string; on: boolean; variant?: "default" | "danger" | "cyan"; size?: "default" | "lg" }) {
  const dim = size === "lg" ? 56 : 44;
  const inner = size === "lg" ? 46 : 36;
  const dot = size === "lg" ? 5 : 3.5;
  const dotTop = size === "lg" ? 14 : 10;
  const dotLeft = size === "lg" ? 16 : 11;
  const glow = variant === "danger" ? "rgba(239,68,68,0.32)" : variant === "cyan" ? "rgba(6,182,214,0.32)" : "rgba(34,197,94,0.32)";
  const grad = variant === "danger" ? "radial-gradient(circle at 28% 26%, #fecaca 0%, #ef4444 38%, #7f1d1d 78%)" : variant === "cyan" ? "radial-gradient(circle at 28% 26%, #a5f3fc 0%, #06b6d4 38%, #0e7490 78%)" : "radial-gradient(circle at 28% 26%, #bbf7d0 0%, #22c55e 38%, #14532d 78%)";
  return (
    <div className="led-block">
      <div className="relative flex items-center justify-center" style={{ width: dim, height: dim }}>
        {}
        <div
          className="absolute rounded-full"
          style={{
            width: dim,
            height: dim,
            background: "linear-gradient(180deg, #1a1d21 0%, #0a0a0b 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 2px rgba(0,0,0,0.7), 0 1px 3px rgba(0,0,0,0.5)",
          }}
        />
        {}
        <div
          className={cn("led")}
          data-on={on}
          data-variant={variant}
          style={{
            width: inner,
            height: inner,
            borderRadius: "50%",
            background: on ? grad : "radial-gradient(circle at 32% 30%, #2a2e36 0%, #0f1115 62%, #000000 100%)",
            border: `1px solid ${on ? (variant === "danger" ? "rgba(239,68,68,0.55)" : variant === "cyan" ? "rgba(6,182,214,0.55)" : "rgba(34,197,94,0.5)") : "rgba(255,255,255,0.06)"}`,
            boxShadow: on ? `0 0 0 4px ${variant === "danger" ? "rgba(239,68,68,0.14)" : variant === "cyan" ? "rgba(6,182,214,0.14)" : "rgba(34,197,94,0.14)"}, 0 0 18px ${glow}, inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -2px 4px rgba(0,0,0,0.35)` : "inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -2px 3px rgba(0,0,0,0.6)",
            position: "relative",
            zIndex: 1,
          } as React.CSSProperties}
        />
        {}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: inner * 0.42,
            height: inner * 0.32,
            top: dim * 0.16,
            left: dim * 0.20,
            background: "radial-gradient(ellipse at center, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.12) 38%, transparent 72%)",
            filter: "blur(0.6px)",
            opacity: on ? 0.9 : 0.35,
          }}
        />
        {}
        {on && <div className="absolute rounded-full pointer-events-none" style={{ width: dot, height: dot, background: "rgba(255,255,255,0.96)", boxShadow: "0 0 7px rgba(255,255,255,0.9)", top: dotTop, left: dotLeft, zIndex: 2 }} />}
      </div>
      <span className="led-label" style={{ color: on ? "var(--ink)" : "var(--ink-subtle)", fontSize: size === "lg" ? 10 : 9 }}>
        {label}
      </span>
    </div>
  )
}
