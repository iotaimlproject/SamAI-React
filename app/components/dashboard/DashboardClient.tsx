"use client";

import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MicFrequency, MicButton } from "@/components/ui/mic-frequency";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Led } from "@/components/ui/led";
import { Sun, Moon } from "lucide-react";
import { handleSpeakResponse } from "@/lib/voiceService";
import { useVoiceCapture } from "@/hooks/useVoiceCapture";
import { NODE_RED_WS_PATHS, closeNodeRedSocket, getNodeRedSocket, sendNodeRedMessage } from "@/lib/nodeRedWebSocket";

function Gauge({ value, accent = "var(--cyan)", size = 84, highlight = false }: { value: number; accent?: string; size?: number; highlight?: boolean }) {
  const dim = size;
  const r = size === 84 ? 32 : size > 84 ? 34 : 28;
  const c = 2 * Math.PI * r;
  const cx = dim / 2;
  const pct = Math.max(0, Math.min(100, value));
  const dash = (pct / 100) * c;
  return (
    <div style={{ position: "relative", width: dim, height: dim, flexShrink: 0, transform: highlight ? "scale(1.06)" : undefined, filter: highlight ? "drop-shadow(0 0 10px rgba(34,197,94,0.22))" : undefined }}>
      <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--hairline-strong)" strokeWidth={highlight ? 1.4 : 1.2} />
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i * 30 * Math.PI) / 180;
          const x1 = cx + (r + 2) * Math.cos(a);
          const y1 = cx + (r + 2) * Math.sin(a);
          const x2 = cx + (r + 4) * Math.cos(a);
          const y2 = cx + (r + 4) * Math.sin(a);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--ink-faint)" strokeWidth={i % 3 === 0 ? 0.9 : 0.5} opacity={i % 3 === 0 ? 0.9 : 0.35} />;
        })}
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={accent} strokeWidth={highlight ? 2.2 : 1.6} strokeLinecap="round" strokeDasharray={`${dash} ${c - dash}`} style={{ opacity: 0.95 }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className="mono-readout" style={{ fontSize: highlight ? 18 : 16, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.04em" }}>{Math.round(pct)}</span>
      </div>
    </div>
  );
}

export default function DashboardClient() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {

    setMounted(true);
    const saved = localStorage.getItem("samai-theme") as "dark" | "light" | null;
    const initial = saved || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    setTheme(initial);
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(initial);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(theme);
    localStorage.setItem("samai-theme", theme);
  }, [theme, mounted]);

  const [machineOn, setMachineOn] = useState(true);
  const [oee, setOee] = useState(97);
  const [availability, setAvailability] = useState(100);
  const [performance, setPerformance] = useState(97);
  const [quality, setQuality] = useState(100);
  const [slNo, setSlNo] = useState(1);
  const [item, setItem] = useState("Solid_Plate");
  const [setQty, setSetQty] = useState(3);
  const [dateTime, setDateTime] = useState("03-09-2026 07:20 PM");
  const [placeOrder, setPlaceOrder] = useState(true);
  const [qtyReq, setQtyReq] = useState(3);
  const [rmQty, setRmQty] = useState(1);
  const [produced, setProduced] = useState(3);

  const [_productionOn] = useState(true);

  const [plannedAt, setPlannedAt] = useState<Date | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [stop, setStop] = useState(false);
  const [perPartRs] = useState(2000);
  const [_plannedRs] = useState(6000);
  const [badParts, setBadParts] = useState(0);
  const [_loss, _setLoss] = useState(0);

  const [activeTab, setActiveTab] = useState<"machine" | "robot" | "log">("machine");
  const [robotOn, setRobotOn] = useState(false);
  const [gripperPercent, setGripperPercent] = useState(40);
  const [logFilter, setLogFilter] = useState<"all" | "info" | "warn" | "error">("all");
  const [logSearch, setLogSearch] = useState("");
  const [micActive, setMicActive] = useState(false);
  const [gripperAction, setGripperAction] = useState<"open" | "close" | "idle">("idle");
  const [logs, setLogs] = useState<Array<{ id: number; time: string; level: string; msg: string; meta?: string }>>(() => {
    const now = new Date();
    const fmt = (d: Date) => d.toLocaleTimeString("en-IN", { hour12: true });
    return [
      { id: 1, time: fmt(now), level: "info", msg: "Dashboard initialized", meta: "machine" },
      { id: 2, time: fmt(new Date(now.getTime() - 60000)), level: "info", msg: "Machine ON", meta: "machine · ON/OFF" },
      { id: 3, time: fmt(new Date(now.getTime() - 120000)), level: "warn", msg: "Performance 97% — within threshold", meta: "oee" },
    ];
  });
  const { listening: micListening, text: micText, setText: setMicInput, stop: stopVoiceCapture } = useVoiceCapture({
    enabled: micActive,
    onResult: async (transcript, isFinal) => {
      if (!isFinal) return;
      sendNodeRedMessage(NODE_RED_WS_PATHS.speak, { device: "speak", value: transcript, text: transcript, source: "dashboard" });
    },
  });
  const toggleMic = () => {
    if (micActive) {
      stopVoiceCapture();
      setMicActive(false);
    } else {
      setMicActive(true);
    }
  };

  const isListening = micActive || micListening;

  useEffect(() => {

    setPlannedAt(new Date("2026-09-03T19:20:09"));
     
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    getNodeRedSocket(NODE_RED_WS_PATHS.machine, {
      onopen: () => console.log("[App] /ws/machine connected"),
      onmessage: (e) => { try { const p = JSON.parse(e.data); if (p.device === "machine") setMachineOn(Boolean(p.value)); } catch { void 0; } },
    });
    return () => closeNodeRedSocket(NODE_RED_WS_PATHS.machine);
  }, []);
  useEffect(() => {
    getNodeRedSocket(NODE_RED_WS_PATHS.speak, {
      onopen: () => console.log("[App] /ws/speak connected"),
      onmessage: (e) => console.log("[App /ws/speak] echo:", e.data),
      onerror: (e) => { const hasDetail = e && typeof e === "object" && Object.keys(e as object).length > 0; if (hasDetail) console.debug("[App /ws/speak] note:", e); },
      onclose: () => console.log("[App /ws/speak] closed"),
    });
    return () => closeNodeRedSocket(NODE_RED_WS_PATHS.speak);
  }, []);
  useEffect(() => {
    getNodeRedSocket(NODE_RED_WS_PATHS.voice, {
      onopen: () => console.log("[App] /ws/voice connected"),
      onmessage: async (e) => {
        let payload: unknown; try { payload = JSON.parse(e.data); } catch { payload = e.data; }
        const p = payload as Record<string, unknown>;
        const text = (p?.value ?? p?.text ?? p?.payload ?? (typeof payload === "string" ? payload : "")) as string;
        if (text && typeof text === "string") setMicInput(text);
        await handleSpeakResponse(payload);
      },
      onerror: (e) => { const hasDetail = e && typeof e === "object" && Object.keys(e as object).length > 0; if (hasDetail) console.debug("[App /ws/voice] note:", e); },
      onclose: () => console.log("[App /ws/voice] closed"),
    });
    return () => closeNodeRedSocket(NODE_RED_WS_PATHS.voice);
  }, [setMicInput]);
  useEffect(() => {
    getNodeRedSocket(NODE_RED_WS_PATHS.stop, {
      onopen: () => console.log("[App] /ws/stop connected"),
      onmessage: (e) => { try { const p = JSON.parse(e.data); if (p.device === "stop") setStop(Boolean(p.value)); } catch { void 0; } },
    });
    return () => closeNodeRedSocket(NODE_RED_WS_PATHS.stop);
  }, []);
  useEffect(() => {
    getNodeRedSocket(NODE_RED_WS_PATHS.reset, {
      onopen: () => console.log("[App] /ws/reset connected"),
      onmessage: (e) => { try { const p = JSON.parse(e.data); if (p.device === "reset" && p.value) { setProduced(0); setBadParts(0); _setLoss(0); } } catch { void 0; } },
    });
    return () => closeNodeRedSocket(NODE_RED_WS_PATHS.reset);
  }, []);
  useEffect(() => {
    getNodeRedSocket(NODE_RED_WS_PATHS.placeOrder, {
      onopen: () => console.log("[App] /ws/placeOrder connected"),
      onmessage: (e) => { try { const p = JSON.parse(e.data); if (p.device === "placeOrder") setPlaceOrder(Boolean(p.value)); } catch { void 0; } },
    });
    return () => closeNodeRedSocket(NODE_RED_WS_PATHS.placeOrder);
  }, []);
  useEffect(() => {
    getNodeRedSocket(NODE_RED_WS_PATHS.dateTime, {
      onopen: () => console.log("[App] /ws/dateTime connected"),
      onmessage: (e) => { try { const p = JSON.parse(e.data); if (p.device === "dateTime") setDateTime(p.value as string); } catch { void 0; } },
    });
    return () => closeNodeRedSocket(NODE_RED_WS_PATHS.dateTime);
  }, []);

  useEffect(() => {
    getNodeRedSocket(NODE_RED_WS_PATHS.telemetry, {
      onopen: () => console.log("[App] /ws/telemetry connected (Node-RED → React)"),
      onmessage: (e) => {
        try {
          const p = JSON.parse(e.data);
          const v = p.value ?? p.payload ?? p;
          if (v && typeof v === "object") {
            const t = v as Record<string, number>;
            if (typeof t.availability === "number") setAvailability(Math.max(0, Math.min(100, t.availability)));
            if (typeof t.performance === "number") setPerformance(Math.max(0, Math.min(100, t.performance)));
            if (typeof t.quality === "number") setQuality(Math.max(0, Math.min(100, t.quality)));
            if (typeof t.oee === "number") setOee(Math.max(0, Math.min(100, t.oee)));
            else if (typeof t.availability === "number" && typeof t.performance === "number" && typeof t.quality === "number") setOee(Math.round((t.availability * t.performance * t.quality) / 10000));
            if (typeof t.qtyReq === "number") setQtyReq(t.qtyReq);
            if (typeof t.requiredQty === "number") setQtyReq(t.requiredQty);
            if (typeof t.produced === "number") setProduced(t.produced);
            if (typeof t.producedQty === "number") setProduced(t.producedQty);
            if (typeof t.rmQty === "number") setRmQty(t.rmQty);
            if (typeof t.rawMaterial === "number") setRmQty(t.rawMaterial);
            if (typeof t.badParts === "number") setBadParts(t.badParts);
            if (typeof t.loss === "number") _setLoss(t.loss);
          }
        } catch {}
      },
    });
    return () => closeNodeRedSocket(NODE_RED_WS_PATHS.telemetry);
  }, []);

  useEffect(() => {
    getNodeRedSocket(NODE_RED_WS_PATHS.robot, {
      onopen: () => console.log("[App] /ws/robot connected (duplex)"),
      onmessage: (e) => {
        try {
          const p = JSON.parse(e.data);
          if (p.device === "robot" && typeof p.value === "boolean") setRobotOn(Boolean(p.value));
          const v = p.value as Record<string, unknown> | boolean;
          if (v && typeof v === "object" && typeof (v as Record<string, unknown>).on === "boolean") setRobotOn(Boolean((v as Record<string, unknown>).on));
          if (p.on !== undefined) setRobotOn(Boolean(p.on));
        } catch {}
      },
    });
    return () => closeNodeRedSocket(NODE_RED_WS_PATHS.robot);
  }, []);

  useEffect(() => {
    getNodeRedSocket(NODE_RED_WS_PATHS.gripper, {
      onopen: () => console.log("[App] /ws/gripper connected (duplex)"),
      onmessage: (e) => {
        try {
          const p = JSON.parse(e.data);
          if (p.device === "gripper") {
            const v = p.value as unknown;
            if (typeof v === "number") setGripperPercent(v);
            else if (v && typeof v === "object") {
              const o = v as Record<string, unknown>;
              if (typeof o.percent === "number") setGripperPercent(o.percent as number);
              if (o.action === "open" || o.action === "close") setGripperAction(o.action as "open" | "close");
            }
            if (p.action === "open" || p.action === "close") setGripperAction(p.action);
            if (typeof p.percent === "number") setGripperPercent(p.percent);
          }
        } catch {}
      },
    });
    return () => closeNodeRedSocket(NODE_RED_WS_PATHS.gripper);
  }, []);

  useEffect(() => {
    getNodeRedSocket(NODE_RED_WS_PATHS.orderData, {
      onopen: () => console.log("[App] /ws/orderData connected (duplex)"),
      onmessage: (e) => {
        try {
          const p = JSON.parse(e.data);
          const m = (p.value ?? p.payload ?? p) as Record<string, unknown>;
          if (typeof m.slNo === "number") setSlNo(m.slNo as number);
          if (typeof m.item === "string") setItem(m.item as string);
          if (typeof m.setQty === "number") setSetQty(m.setQty as number);
          if (typeof m.dateTime === "string") setDateTime(m.dateTime as string);
          if ((p.device === "order" || p.device === "orderData") && m) {
            if (typeof m.slNo === "number") setSlNo(m.slNo as number);
            if (typeof m.item === "string") setItem(m.item as string);
          }
        } catch {}
      },
    });
    return () => closeNodeRedSocket(NODE_RED_WS_PATHS.orderData);
  }, []);

  const handleSubmit = () => {
    const next = new Date(dateTime);
    setPlannedAt(next);
    setQtyReq(setQty);
    const orderPayload = { device: "orderData", value: { slNo, item, setQty, dateTime, plannedAt: next.toISOString() } };
    sendNodeRedMessage(NODE_RED_WS_PATHS.orderData, orderPayload);
    sendNodeRedMessage(NODE_RED_WS_PATHS.dateTime, { device: "dateTime", value: dateTime });
  };
  const handleReset = () => {
    setBadParts(0); _setLoss(0); setStop(false);
    sendNodeRedMessage(NODE_RED_WS_PATHS.reset, { device: "reset", value: true });
  };

  if (!mounted) return <div className="page" style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--canvas)" }}><div className="mobile-shell" style={{ width: "100%", maxWidth: 390, margin: "0 auto", minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--canvas)", borderLeft: "1px solid var(--hairline)", borderRight: "1px solid var(--hairline)", boxSizing: "border-box" }}><p className="eyebrow" style={{ textAlign: "center" }}>Initializing…</p></div></div>;

  const elapsedLabel = now ? now.toLocaleTimeString("en-IN", { hour12: true }) : "07:22:58 PM";
  const plannedLabel = plannedAt ? `${plannedAt.toLocaleDateString("en-GB")} ${plannedAt.toLocaleTimeString("en-IN", { hour12: true })}` : "03/09/2026 07:20:09 PM";

  return (
    <div className="page" style={{ background: "var(--canvas)", minHeight: "100vh", overflowX: "hidden" }}>
      <div className="mobile-shell" style={{ width: "100%", maxWidth: 390, margin: "0 auto", background: "var(--canvas)", minHeight: "100vh", display: "flex", flexDirection: "column", borderLeft: "1px solid var(--hairline)", borderRight: "1px solid var(--hairline)", boxSizing: "border-box", overflow: "visible", padding: "0 12px" }}>
        {}
        <div style={{ margin: "0 -12px", padding: "14px 28px 10px", borderBottom: "1px solid var(--hairline)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, background: "var(--canvas)" }}>
          <div>
            <p className="micro-label" style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--ink-subtle)", margin: 0, lineHeight: 1 }}>Overview</p>
            <h1 className="text-[18px] font-bold tracking-tight" style={{ letterSpacing: "-0.02em", color: "var(--ink)", marginTop: 2, lineHeight: 1.1 }}>SamAI Dashboard</h1>
          </div>
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="grid place-items-center rounded-full border shrink-0"
            style={{ background: "var(--panel)", borderColor: "var(--hairline)", color: "var(--ink)", width: 36, height: 36 }}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>

        {}
        <div style={{ margin: "0 -12px", display: "flex", gap: 6, padding: "8px 12px 10px", background: "var(--canvas)", borderBottom: "1px solid var(--hairline)" }}>
          {(["machine", "robot", "log"] as const).map((t) => {
            const active = activeTab === t;
            return (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className="flex-1 rounded-lg border text-xs font-bold tracking-wide uppercase transition-colors"
                style={{
                  padding: "8px 0",
                  background: active ? "var(--panel)" : "transparent",
                  borderColor: active ? "var(--hairline-strong)" : "var(--hairline)",
                  color: active ? "var(--ink)" : "var(--ink-muted)",
                  boxShadow: active ? "inset 0 1px 0 rgba(255,255,255,0.04)" : "none",
                }}
              >
                {t}
              </button>
            );
          })}
        </div>

        {activeTab === "machine" && (
          <>
            {}
            <div className="instrument" style={{ margin: "12px 0 0", borderRadius: 12, background: "var(--panel)", border: "1.5px solid var(--hairline)", boxShadow: "0 1px 0 rgba(255,255,255,0.03), 0 4px 16px rgba(0,0,0,0.18)", overflow: "hidden" }}>
          <div style={{ padding: "14px 16px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div className="flex items-center gap-3">
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", color: "var(--ink)", textTransform: "uppercase" }}>Machine</span>
              <Switch
                checked={machineOn}
                onCheckedChange={(v) => { setMachineOn(v); sendNodeRedMessage(NODE_RED_WS_PATHS.machine, { device: "machine", value: v }); }}
                aria-label="Machine"
                className="data-[state=checked]:bg-[#22c55e]"
              />
            </div>
            <div className="flex items-center gap-5">
              <Led label="ON/OFF" on={machineOn} variant="default" size="lg" />
              <Led label="PRODUCTION" on={machineOn} variant={machineOn && stop ? "danger" : "default"} size="lg" />
            </div>
          </div>
          <div style={{ padding: "0 16px 12px", borderTop: "1px solid var(--hairline)", marginTop: 2 }}>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "var(--ink-muted)", textTransform: "uppercase", marginTop: 8 }}>CNC Machine</p>
          </div>
        </div>

        {}
        <div className="instrument" style={{ margin: "10px 0 0", borderRadius: 10, background: "var(--panel)", border: "1px solid var(--hairline)", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <p className="text-xs" style={{ color: "var(--ink-muted)", fontSize: 11 }}>Planned: <b style={{ color: "var(--ink)", fontWeight: 700 }}>{plannedLabel}</b></p>
          <p className="mono-readout text-xs font-bold" style={{ color: "#ef4444", fontSize: 12 }}>{elapsedLabel}</p>
        </div>

        {}
        <div className="instrument" style={{ margin: "10px 0 0", borderRadius: 12, background: "var(--panel)", border: "1px solid var(--hairline)", boxShadow: "0 1px 0 rgba(255,255,255,0.03), 0 4px 16px rgba(0,0,0,0.18)", overflow: "hidden", padding: "14px 12px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, alignItems: "end" }}>
            <div className="flex flex-col items-center gap-1.5">
              <Gauge value={availability} accent="#22c55e" size={76} />
              <p className="micro-label" style={{ fontSize: 11, color: "var(--ink-muted)", fontWeight: 400, textTransform: "none", letterSpacing: "0" }}>Availability</p>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <Gauge value={performance} accent="var(--cyan)" size={76} />
              <p className="micro-label" style={{ fontSize: 11, color: "var(--ink-muted)", fontWeight: 400, textTransform: "none", letterSpacing: "0" }}>Performance</p>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <Gauge value={quality} accent="#22c55e" size={76} />
              <p className="micro-label" style={{ fontSize: 11, color: "var(--ink-muted)", fontWeight: 400, textTransform: "none", letterSpacing: "0" }}>Quality</p>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <Gauge value={oee} accent={oee > 80 ? "#22c55e" : oee > 60 ? "#f59e0b" : "#ef4444"} size={92} highlight />
              <p className="micro-label" style={{ fontSize: 11, color: "var(--ink)", fontWeight: 700, textTransform: "none", letterSpacing: "0" }}>OEE</p>
            </div>
          </div>
        </div>

        {}
        <div className="instrument" style={{ margin: "10px 0 0", borderRadius: 12, background: "var(--panel)", border: "1px solid var(--hairline)", boxShadow: "0 1px 0 rgba(255,255,255,0.03), 0 4px 16px rgba(0,0,0,0.18)", overflow: "visible", padding: "14px 12px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr 1fr", gap: 10, alignItems: "end" }}>
            <div>
              <Label className="micro-label" style={{ fontSize: 10, color: "var(--ink-muted)", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 6, display: "block" }}>Sl No.</Label>
              <Input type="number" value={slNo} onChange={(e) => setSlNo(Number(e.target.value) || 1)} className="h-9 rounded-lg border px-3 text-sm mono-readout font-semibold" style={{ background: "var(--module)", borderColor: "var(--hairline-strong)", color: "var(--ink)" }} />
            </div>
            <div>
              <Label className="micro-label" style={{ fontSize: 10, color: "var(--ink-muted)", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 6, display: "block" }}>Item</Label>
              <Select value={item} onValueChange={(v) => setItem(v)}>
                <SelectTrigger className="h-9 rounded-lg border px-3 text-sm font-semibold" style={{ background: "var(--module)", borderColor: "var(--hairline-strong)", color: "var(--ink)" }}><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Solid_Plate">1 · Solid_Plate</SelectItem><SelectItem value="Hollow_Plate">2 · Hollow_Plate</SelectItem><SelectItem value="Bracket">3 · Bracket</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <Label className="micro-label" style={{ fontSize: 10, color: "var(--ink-muted)", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 6, display: "block" }}>Set Qty</Label>
              <Input type="number" value={setQty} onChange={(e) => setSetQty(Number(e.target.value) || 0)} className="h-9 rounded-lg border px-3 text-sm mono-readout font-semibold" style={{ background: "var(--module)", borderColor: "var(--hairline-strong)", color: "var(--ink)" }} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <Label className="micro-label" style={{ fontSize: 11, color: "var(--ink-muted)", fontWeight: 400, textTransform: "none", letterSpacing: "0", marginBottom: 4, display: "block" }}>Select Date and Time (IST)</Label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "end" }}>
              <DateTimePicker value={dateTime} onChange={setDateTime} />
              <Button onClick={handleSubmit} className="h-8 rounded-md px-5 text-xs font-semibold" style={{ background: "#3b82f6", color: "white", borderRadius: 6 }}>Submit</Button>
            </div>
          </div>
        </div>

        {}
        <div className="instrument" style={{ margin: "10px 0 0", borderRadius: 12, background: "var(--panel)", border: "1.5px solid var(--hairline)", boxShadow: "0 1px 0 rgba(255,255,255,0.03), 0 4px 16px rgba(0,0,0,0.18)", overflow: "hidden", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="flex items-center gap-3">
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", letterSpacing: "0.02em" }}>Place Order</span>
            <Switch checked={placeOrder} onCheckedChange={(v) => { setPlaceOrder(v); sendNodeRedMessage(NODE_RED_WS_PATHS.placeOrder, { device: "placeOrder", value: v }); }} className="data-[state=checked]:bg-[#3b82f6]" aria-label="Place order" />
          </div>
          <div className="text-right" style={{ minWidth: 110 }}>
            <p className="micro-label" style={{ fontSize: 10, letterSpacing: "0.08em", textAlign: "right" }}>Status</p>
            <p className="font-extrabold" style={{ color: "#60a5fa", marginTop: 4, fontSize: 15, letterSpacing: "-0.01em" }}>{placeOrder ? "Order Placed" : "Not Placed"}</p>
          </div>
        </div>

        {}
        <div className="instrument" style={{ margin: "10px 0 0", borderRadius: 12, background: "var(--panel)", border: "1px solid var(--hairline)", boxShadow: "0 1px 0 rgba(255,255,255,0.03), 0 4px 16px rgba(0,0,0,0.18)", overflow: "hidden", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="flex items-center gap-3">
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", letterSpacing: "0.01em" }}>Stop</span>
            <Switch checked={stop} onCheckedChange={(v) => { setStop(v); sendNodeRedMessage(NODE_RED_WS_PATHS.stop, { device: "stop", value: v }); }} className="data-[state=checked]:bg-[#ef4444]" aria-label="Stop" />
          </div>
          <Button onClick={handleReset} className="h-10 px-8 rounded-lg text-sm font-bold" style={{ background: "#22c55e", color: "white", borderRadius: 10, minWidth: 92, border: "1px solid #16a34a", boxShadow: "none" }}>Reset</Button>
        </div>

        {}
        <div className="instrument" style={{ margin: "10px 0 0", borderRadius: 12, background: "var(--panel)", border: "1px solid var(--hairline)", boxShadow: "0 1px 0 rgba(255,255,255,0.03), 0 4px 16px rgba(0,0,0,0.18)", overflow: "hidden", padding: "12px 16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div><p className="micro-label" style={{ fontSize: 11, color: "var(--ink-muted)", fontWeight: 400, textTransform: "none", letterSpacing: "0" }}>Required QTY</p><p className="mono-readout" style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>{qtyReq}</p></div>
            <div><p className="micro-label" style={{ fontSize: 11, color: "var(--ink-muted)", fontWeight: 400, textTransform: "none", letterSpacing: "0" }}>Raw Material</p><p className="mono-readout" style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>{rmQty}</p></div>
            <div><p className="micro-label" style={{ fontSize: 11, color: "var(--ink-muted)", fontWeight: 400, textTransform: "none", letterSpacing: "0" }}>Produced QTY</p><p className="mono-readout" style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>{produced}</p></div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span className="micro-label" style={{ fontSize: 10, color: "var(--ink-subtle)" }}>Progress</span>
              <span className="mono-readout" style={{ fontSize: 11, fontWeight: 700, color: produced >= qtyReq ? "#22c55e" : "var(--cyan)" }}>{qtyReq > 0 ? Math.round((produced / qtyReq) * 100) : 0}% · {produced}/{qtyReq}</span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.08)", border: "1px solid var(--hairline)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${qtyReq > 0 ? Math.min(100, (produced / qtyReq) * 100) : 0}%`, background: produced >= qtyReq ? "linear-gradient(90deg, #22c55e 0%, #4ade80 100%)" : "linear-gradient(90deg, #06b6d4 0%, #22d3ee 100%)", borderRadius: 999, transition: "width 0.6s ease", boxShadow: produced >= qtyReq ? "0 0 8px rgba(34,197,94,0.45)" : "0 0 8px rgba(6,182,214,0.35)" }} />
            </div>
          </div>
        </div>

        {}
        {(() => {
          const goodParts = Math.max(0, produced - badParts);
          const plannedVal = qtyReq * perPartRs;
          const producedVal = goodParts * perPartRs;
          const badVal = badParts * perPartRs;
          const lossVal = badVal;
          return (
            <div className="instrument" style={{ margin: "10px 0 0", borderRadius: 12, background: "var(--panel)", border: "1px solid var(--hairline)", boxShadow: "0 1px 0 rgba(255,255,255,0.03), 0 4px 16px rgba(0,0,0,0.18)", overflow: "hidden", padding: "14px 16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                <div><p className="micro-label" style={{ fontSize: 10, color: "var(--ink-muted)", letterSpacing: "0.06em" }}>Per Part (Rs)</p><p className="mono-readout" style={{ fontSize: 15, fontWeight: 800, marginTop: 6, color: "var(--ink)" }}>{perPartRs.toLocaleString("en-IN")}</p></div>
                <div><p className="micro-label" style={{ fontSize: 10, color: "var(--ink-muted)", letterSpacing: "0.06em" }}>Planned (Rs)</p><p className="mono-readout" style={{ fontSize: 15, fontWeight: 800, marginTop: 6, color: "var(--cyan)" }}>{plannedVal.toLocaleString("en-IN")}</p></div>
                <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.18)", borderRadius: 8, padding: "6px 8px", margin: "-6px -8px" }}><p className="micro-label" style={{ fontSize: 10, color: "#22c55e", letterSpacing: "0.06em" }}>Profit (Rs)</p><p className="mono-readout" style={{ fontSize: 15, fontWeight: 800, marginTop: 6, color: "#22c55e" }}>{producedVal.toLocaleString("en-IN")}</p></div>
              </div>
              <div style={{ height: 1, background: "var(--hairline)", margin: "12px 0" }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                <div><p className="micro-label" style={{ fontSize: 10, color: "var(--ink-muted)", letterSpacing: "0.06em" }}>Good Parts</p><p className="mono-readout" style={{ fontSize: 15, fontWeight: 800, marginTop: 6, color: "#22c55e" }}>{goodParts}</p></div>
                <div><p className="micro-label" style={{ fontSize: 10, color: "var(--ink-muted)", letterSpacing: "0.06em" }}>Bad Parts</p><p className="mono-readout" style={{ fontSize: 15, fontWeight: 800, marginTop: 6, color: badParts > 0 ? "#ef4444" : "var(--ink)" }}>{badParts}</p></div>
                <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)", borderRadius: 8, padding: "6px 8px", margin: "-6px -8px" }}><p className="micro-label" style={{ fontSize: 10, color: "#ef4444", letterSpacing: "0.06em" }}>Loss (Rs)</p><p className="mono-readout" style={{ fontSize: 15, fontWeight: 800, marginTop: 6, color: "#ef4444" }}>{lossVal > 0 ? `-${lossVal.toLocaleString("en-IN")}` : "0"}</p></div>
              </div>
            </div>
          );
        })()}

          </>
        )}

        {activeTab === "robot" && (
          <>
            {}
            <div className="instrument" style={{ margin: "12px 0 0", borderRadius: 12, background: "var(--panel)", border: "1.5px solid var(--hairline)", overflow: "hidden" }}>
              <div style={{ padding: "14px 16px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                <div className="flex items-center gap-3">
                  <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", color: "var(--ink)", textTransform: "uppercase" }}>Robot</span>
                  <Switch checked={robotOn} onCheckedChange={(v) => { setRobotOn(v); sendNodeRedMessage(NODE_RED_WS_PATHS.robot, { device: "robot", value: v }); setLogs((l) => [{ id: Date.now(), time: new Date().toLocaleTimeString("en-IN", { hour12: true }), level: v ? "info" : "warn", msg: v ? "Robot ON" : "Robot OFF", meta: "robot" }, ...l].slice(0, 50)); }} className={robotOn ? "data-[state=checked]:bg-[#22c55e]" : ""} />
                </div>
                <Led label="ROBOT" on={robotOn} variant="default" size="lg" />
              </div>
              <div style={{ padding: "0 16px 12px", borderTop: "1px solid var(--hairline)", marginTop: 2 }}>
                <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "var(--ink-muted)", textTransform: "uppercase", marginTop: 8 }}>{robotOn ? "System Armed" : "System Idle"}</p>
              </div>
            </div>

            {}
            <div className="instrument" style={{ margin: "10px 0 0", borderRadius: 12, background: "var(--panel)", border: "1px solid var(--hairline)", padding: "14px 16px" }}>
              <p className="micro-label" style={{ fontSize: 10, letterSpacing: "0.08em", marginBottom: 8 }}>Control of Creeper</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center" }}>
                <div>
                  <p style={{ fontSize: 11, color: "var(--ink-muted)", marginBottom: 4 }}>Gripper Position</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input type="range" min={0} max={100} value={gripperPercent} onChange={(e) => { const v = Number(e.target.value); setGripperPercent(v); setGripperAction("idle"); sendNodeRedMessage(NODE_RED_WS_PATHS.gripper, { device: "gripper", value: { percent: v } }); }} style={{ flex: 1, accentColor: "#22c55e" }} disabled={!robotOn} />
                    <span className="mono-readout" style={{ fontSize: 13, fontWeight: 800, minWidth: 44, textAlign: "right", color: robotOn ? "var(--ink)" : "var(--ink-faint)" }}>{gripperPercent}%</span>
                  </div>
                </div>
                <span className={`dot ${robotOn ? (gripperAction === "open" ? "dot--green" : gripperAction === "close" ? "dot--red" : "dot--cyan") : "dot--muted"}`} style={{ width: 8, height: 8 }} />
              </div>
            </div>

            {}
            <div className="instrument" style={{ margin: "10px 0 16px", borderRadius: 12, background: "var(--panel)", border: "1px solid var(--hairline)", padding: "14px 16px" }}>
              <p className="micro-label" style={{ fontSize: 10, letterSpacing: "0.08em", marginBottom: 10 }}>Panel Control of Creeper</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <Button
                  onClick={() => { if (!robotOn) return; setGripperPercent(100); setGripperAction("open"); sendNodeRedMessage(NODE_RED_WS_PATHS.gripper, { device: "gripper", value: { action: "open", percent: 100 } }); setLogs((l) => [{ id: Date.now(), time: new Date().toLocaleTimeString("en-IN", { hour12: true }), level: "info", msg: "Gripper OPEN 100%", meta: "creeper" }, ...l].slice(0, 50)); }}
                  disabled={!robotOn}
                  className="h-10 rounded-lg text-xs font-bold"
                  style={{ background: gripperAction === "open" ? "#22c55e" : "var(--module)", color: gripperAction === "open" ? "white" : "var(--ink)", border: `1px solid ${gripperAction === "open" ? "#16a34a" : "var(--hairline)"}` }}
                >
                  Open
                </Button>
                <Button
                  onClick={() => { if (!robotOn) return; setGripperPercent(0); setGripperAction("close"); sendNodeRedMessage(NODE_RED_WS_PATHS.gripper, { device: "gripper", value: { action: "close", percent: 0 } }); setLogs((l) => [{ id: Date.now(), time: new Date().toLocaleTimeString("en-IN", { hour12: true }), level: "warn", msg: "Gripper CLOSE 0%", meta: "creeper" }, ...l].slice(0, 50)); }}
                  disabled={!robotOn}
                  className="h-10 rounded-lg text-xs font-bold"
                  style={{ background: gripperAction === "close" ? "#ef4444" : "var(--module)", color: gripperAction === "close" ? "white" : "var(--ink)", border: `1px solid ${gripperAction === "close" ? "#dc2626" : "var(--hairline)"}` }}
                >
                  Close
                </Button>
                <div className="rounded-lg border flex flex-col items-center justify-center" style={{ background: "var(--module)", borderColor: "var(--hairline)", padding: "6px" }}>
                  <span className="micro-label" style={{ fontSize: 8 }}>Percent</span>
                  <span className="mono-readout" style={{ fontSize: 14, fontWeight: 800, color: robotOn ? "#22c55e" : "var(--ink-faint)" }}>{gripperPercent}%</span>
                </div>
              </div>
              <p className="micro-label" style={{ marginTop: 8, fontSize: 9, textAlign: "center", color: "var(--ink-subtle)" }}>{robotOn ? `Panel • ${gripperAction === "idle" ? "Ready" : gripperAction.toUpperCase()} • ${gripperPercent}%` : "Robot OFF — enable to control"}</p>
            </div>
          </>
        )}

        {activeTab === "log" && (
          <>
            {}
            <div className="instrument" style={{ margin: "12px 0 0", borderRadius: 12, background: "var(--panel)", border: "1px solid var(--hairline)", padding: "12px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                <p className="micro-label" style={{ fontSize: 10 }}>Application Log</p>
                <span className="mono-readout" style={{ fontSize: 10, color: "var(--ink-subtle)" }}>{logs.length} entries</span>
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                {(["all", "info", "warn", "error"] as const).map((f) => (
                  <button key={f} onClick={() => setLogFilter(f)} className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide border" style={{ background: logFilter === f ? "var(--ink)" : "transparent", color: logFilter === f ? "var(--canvas)" : "var(--ink-muted)", borderColor: logFilter === f ? "var(--ink)" : "var(--hairline)" }}>{f}</button>
                ))}
              </div>
              <Input placeholder="Search logs…" value={logSearch} onChange={(e) => setLogSearch(e.target.value)} className="h-8 rounded-lg border px-3 text-xs" style={{ background: "var(--module)", borderColor: "var(--hairline)", color: "var(--ink)" }} />
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <span className="micro-label" style={{ fontSize: 8, padding: "4px 6px", borderRadius: 6, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", color: "#22c55e" }}>level: {logFilter}</span>
                <span className="micro-label" style={{ fontSize: 8, padding: "4px 6px", borderRadius: 6, background: "var(--module)", border: "1px solid var(--hairline)" }}>advanced: meta / time / device</span>
              </div>
            </div>

            <div className="instrument" style={{ margin: "10px 0 16px", borderRadius: 12, background: "var(--panel)", border: "1px solid var(--hairline)", overflow: "hidden" }}>
              <div style={{ maxHeight: 420, overflowY: "auto" }}>
                {logs
                  .filter((l) => (logFilter === "all" ? true : l.level === logFilter))
                  .filter((l) => (logSearch ? `${l.msg} ${l.meta ?? ""}`.toLowerCase().includes(logSearch.toLowerCase()) : true))
                  .map((l) => (
                    <div key={l.id} style={{ padding: "10px 12px", borderBottom: "1px solid var(--hairline)", display: "flex", gap: 10, background: l.level === "error" ? "rgba(239,68,68,0.06)" : l.level === "warn" ? "rgba(245,158,11,0.06)" : "transparent" }}>
                      <span className="mono-readout" style={{ fontSize: 10, color: "var(--ink-subtle)", minWidth: 72 }}>{l.time}</span>
                      <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ background: l.level === "info" ? "rgba(34,197,94,0.14)" : l.level === "warn" ? "rgba(245,158,11,0.14)" : "rgba(239,68,68,0.14)", color: l.level === "info" ? "#22c55e" : l.level === "warn" ? "#f59e0b" : "#ef4444", height: 16 }}>{l.level}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", margin: 0 }}>{l.msg}</p>
                        {l.meta && <p className="mono-readout" style={{ fontSize: 10, color: "var(--ink-subtle)", marginTop: 2 }}>{l.meta}</p>}
                      </div>
                    </div>
                  ))}
                {logs.length === 0 && <p className="micro-label" style={{ padding: 16, textAlign: "center" }}>No logs</p>}
              </div>
              <div style={{ padding: "8px 12px", borderTop: "1px solid var(--hairline)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="micro-label" style={{ fontSize: 9 }}>Direct telemetry • live WS</span>
                <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => setLogs((l) => [{ id: Date.now(), time: new Date().toLocaleTimeString("en-IN", { hour12: true }), level: "info", msg: "Advanced filter applied", meta: `filter=${logFilter}` }, ...l].slice(0, 50))}>Advanced</Button>
              </div>
            </div>
          </>
        )}
        <div style={{ height: 132 }} />
        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 390, padding: "0 12px 10px", boxSizing: "border-box", zIndex: 40, pointerEvents: "none" }}>
          <div className="instrument" style={{ background: "var(--panel)", border: "1px solid var(--hairline)", boxShadow: "0 -2px 20px rgba(0,0,0,0.45), 0 4px 16px rgba(0,0,0,0.35)", borderRadius: 12, overflow: "hidden", padding: "12px 14px", pointerEvents: "auto" }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
              <span className="micro-label">Operator Command · Voice</span>
              <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-widest uppercase" style={{ color: isListening ? "var(--green)" : "var(--ink-subtle)" }}>
                <span className={`dot ${isListening ? "dot--green" : "dot--muted"}`} style={{ width: 6, height: 6 }} />
                {isListening ? "Listening" : "Idle"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <MicButton active={isListening} onToggle={toggleMic} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <MicFrequency active={isListening} />
              </div>
            </div>
            {micText ? (
              <div className="mono-readout" style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.18)", fontSize: 11, color: "var(--ink)", minHeight: 28, maxHeight: 56, overflowY: "auto" }}>
                {micText}
              </div>
            ) : isListening ? (
              <p className="micro-label" style={{ marginTop: 6, color: "var(--green)", fontSize: 9, textAlign: "center", fontWeight: 600 }}>
                Listening… tap mic to stop
              </p>
            ) : (
              <p className="micro-label" style={{ marginTop: 6, color: "var(--ink-subtle)", fontSize: 9, textAlign: "center" }}>
                Tap mic to give a voice command
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
