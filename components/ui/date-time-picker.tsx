"use client";
import { useEffect, useMemo, useState } from "react";
import { Calendar, Clock3, ChevronLeft, ChevronRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = { value: string; onChange: (_v: string) => void; disabled?: boolean };

function parseIST(v: string): Date {

  const m = v.match(/(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (m) {
    let h = parseInt(m[4], 10);
    const mm = parseInt(m[5], 10);
    const ap = m[6].toUpperCase();
    if (ap === "PM" && h !== 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    return new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10), h, mm);
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? new Date() : d;
}
function formatIST(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  let h = d.getHours();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const hh = String(h).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}-${mm}-${yyyy} ${hh}:${min} ${ap}`;
}

export function DateTimePicker({ value, onChange, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const initial = useMemo(() => parseIST(value), [value]);
  const [view, setView] = useState<Date>(initial);
  const [selected, setSelected] = useState<Date>(initial);
  const [hour, setHour] = useState(() => { const h = initial.getHours() % 12 || 12; return h; });
  const [minute, setMinute] = useState(() => initial.getMinutes());
  const [ampm, setAmpm] = useState<"AM" | "PM">(() => (initial.getHours() >= 12 ? "PM" : "AM"));

  useEffect(() => { const p = parseIST(value); setSelected(p); setView(p); setHour(p.getHours() % 12 || 12); setMinute(p.getMinutes()); setAmpm(p.getHours() >= 12 ? "PM" : "AM"); }, [value]);

  const days = useMemo(() => {
    const y = view.getFullYear(), m = view.getMonth();
    const first = new Date(y, m, 1).getDay();
    const dim = new Date(y, m + 1, 0).getDate();
    const cells: (number | null)[] = Array(first).fill(null).concat(Array.from({ length: dim }, (_, i) => i + 1));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [view]);

  const apply = (d: Date) => {
    let h24 = hour % 12; if (ampm === "PM") h24 += 12; if (ampm === "AM" && hour === 12) h24 = 0;
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h24, minute);
    setSelected(next);
    onChange(formatIST(next));
    setOpen(false);
  };

  const monthLabel = view.toLocaleString("en-IN", { month: "long", year: "numeric" });

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className="flex w-full items-center justify-between rounded-lg border px-3 text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: "var(--module)", borderColor: "var(--hairline-strong)", height: 36, color: "var(--ink)", opacity: disabled ? 0.5 : 1 }}
        aria-label="Pick date and time"
      >
        <span className="flex items-center gap-2" style={{ color: "var(--ink)", fontSize: 13, fontWeight: 600 }}>
          <Calendar size={14} style={{ color: "#60a5fa" }} /> {value || "Pick date & time"}
        </span>
        <Clock3 size={14} style={{ color: "var(--ink-subtle)" }} />
      </button>

      {open && (
        <div
          className="absolute z-50 mt-2 rounded-xl border p-2.5 shadow-2xl left-0 right-0 mx-auto"
          style={{ background: "var(--panel)", borderColor: "var(--hairline)", boxShadow: "0 12px 32px rgba(0,0,0,0.55)", width: "min(260px, calc(100vw - 24px))", left: "50%", transform: "translateX(-50%)" }}
        >
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} className="h-7 w-7 grid place-items-center rounded-md" style={{ background: "rgba(255,255,255,0.06)" }}><ChevronLeft size={14} /></button>
            <span className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{monthLabel}</span>
            <button type="button" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} className="h-7 w-7 grid place-items-center rounded-md" style={{ background: "rgba(255,255,255,0.06)" }}><ChevronRight size={14} /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => <span key={d} className="text-center text-[10px] font-medium" style={{ color: "var(--ink-subtle)" }}>{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((d, i) => {
              if (d === null) return <span key={i} />;
              const isSel = selected.getDate() === d && selected.getMonth() === view.getMonth() && selected.getFullYear() === view.getFullYear();
              const isToday = new Date().toDateString() === new Date(view.getFullYear(), view.getMonth(), d).toDateString();
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => { const nd = new Date(view.getFullYear(), view.getMonth(), d); let h24 = hour % 12; if (ampm === "PM") h24 += 12; if (ampm === "AM" && hour === 12) h24 = 0; apply(new Date(nd.getFullYear(), nd.getMonth(), nd.getDate(), h24, minute)); }}
                  className="h-7 w-7 rounded-md text-xs font-medium"
                  style={{ background: isSel ? "#3b82f6" : isToday ? "rgba(59,130,246,0.15)" : "transparent", color: isSel ? "white" : "var(--ink)", border: isToday && !isSel ? "1px solid rgba(59,130,246,0.35)" : "1px solid transparent" }}
                >{d}</button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between rounded-lg p-1.5 gap-1.5" style={{ background: "var(--module)", border: "1px solid var(--hairline)" }}>
            <div className="flex items-center gap-1">
              <Select value={String(hour)} onValueChange={(v) => setHour(parseInt(v, 10))}>
                <SelectTrigger className="h-7 w-[54px] rounded-md border px-1.5 text-xs font-semibold" style={{ background: "var(--panel)", borderColor: "var(--hairline-strong)", color: "var(--ink)" }}><SelectValue /></SelectTrigger>
                <SelectContent style={{ background: "var(--panel)", borderColor: "var(--hairline)" }}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => <SelectItem key={h} value={String(h)}>{String(h).padStart(2, "0")}</SelectItem>)}
                </SelectContent>
              </Select>
              <span style={{ color: "var(--ink)", fontWeight: 700, fontSize: 12 }}>:</span>
              <Select value={String(minute).padStart(2, "0")} onValueChange={(v) => setMinute(parseInt(v, 10))}>
                <SelectTrigger className="h-7 w-[54px] rounded-md border px-1.5 text-xs font-semibold" style={{ background: "var(--panel)", borderColor: "var(--hairline-strong)", color: "var(--ink)" }}><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-[160px]" style={{ background: "var(--panel)", borderColor: "var(--hairline)" }}>
                  {Array.from({ length: 60 }, (_, i) => i).map((m) => <SelectItem key={m} value={String(m).padStart(2, "0")}>{String(m).padStart(2, "0")}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="ml-1 flex rounded-md overflow-hidden border shrink-0" style={{ borderColor: "var(--hairline-strong)", background: "var(--panel)" }}>
                {(["AM", "PM"] as const).map((ap) => (
                  <button key={ap} type="button" onClick={() => setAmpm(ap)} className="px-2 py-1 text-[11px] font-bold transition-colors" style={{ background: ampm === ap ? "#3b82f6" : "transparent", color: ampm === ap ? "white" : "var(--ink-muted)" }}>{ap}</button>
                ))}
              </div>
            </div>
            <button type="button" onClick={() => { let h24 = hour % 12; if (ampm === "PM") h24 += 12; if (ampm === "AM" && hour === 12) h24 = 0; const nd = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), h24, minute); setSelected(nd); onChange(formatIST(nd)); setOpen(false); }} className="rounded-md px-2.5 py-1 text-[11px] font-bold shrink-0" style={{ background: "#3b82f6", color: "white" }}>Set</button>
          </div>
        </div>
      )}
    </div>
  );
}
