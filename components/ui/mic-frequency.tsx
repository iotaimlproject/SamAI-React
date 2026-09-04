"use client";

import { useEffect, useRef } from "react";

export function MicFrequency({ active, className }: { active: boolean; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rawCtx = canvas.getContext("2d");
    if (!rawCtx) return;
    const c = rawCtx as CanvasRenderingContext2D;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    c.scale(dpr, dpr);
    const width = rect.width;
    const height = rect.height;

    if (!active) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {  }
      streamRef.current = null;
      try { ctxRef.current?.close(); } catch {  }
      ctxRef.current = null;
      analyserRef.current = null;
      c.clearRect(0, 0, width, height);
      c.fillStyle = "rgba(255,255,255,0.06)";
      for (let i = 0; i < 16; i++) {
        const x = (i * width) / 16 + 2;
        c.fillRect(x, height / 2 - 1, width / 16 - 4, 2);
      }
      return;
    }

    let cancelled = false;
    const dataArray = new Uint8Array(64);

    const initAnalyser = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const ac = new AudioContext();
        ctxRef.current = ac;
        const source = ac.createMediaStreamSource(stream);
        const analyser = ac.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);
        analyserRef.current = analyser;
      } catch {

        analyserRef.current = null;
      }
    };
    void initAnalyser();

    function draw() {
      if (cancelled) return;
      rafRef.current = requestAnimationFrame(draw);
      c.clearRect(0, 0, width, height);
      const bars = 16;
      const gap = 3;
      const barW = (width - gap * (bars - 1)) / bars;

      let freqData: number[] | null = null;
      if (analyserRef.current) {
        analyserRef.current.getByteFrequencyData(dataArray);
        freqData = Array.from(dataArray.slice(0, bars));
      }

      for (let i = 0; i < bars; i++) {
        let intensity: number;
        if (freqData) {
          intensity = Math.max(0.12, freqData[i] / 255);
        } else {
          const centreWeight = 1 - Math.abs(i - bars / 2) / (bars / 2);
          const drift = Math.sin(Date.now() / 240 + i * 0.9) * 0.5 + 0.5;
          const rnd = 0.35 + Math.random() * 0.65;
          intensity = 0.12 + (centreWeight * 0.55 + drift * 0.45) * rnd * 0.82;
        }
        const h = 3 + intensity * (height * 0.86);
        const x = i * (barW + gap);
        const y = (height - h) / 2;
        const col = intensity > 0.52 ? `rgba(34,197,94,${0.72 + intensity * 0.28})` : `rgba(0,213,255,${0.62 + intensity * 0.32})`;
        c.fillStyle = col;
        c.beginPath();
        const rr = (c as unknown as { roundRect?: (_x: number, _y: number, _w: number, _h: number, _r: number) => void }).roundRect;
        if (rr) rr.call(c, x, y, barW, h, 2);
        else c.fillRect(x, y, barW, h);
        c.fill();
        if (intensity > 0.48) {
          c.shadowColor = intensity > 0.66 ? "rgba(34,197,94,0.34)" : "rgba(0,213,255,0.30)";
          c.shadowBlur = 6;
          c.fill();
          c.shadowBlur = 0;
        }
      }
    }
    draw();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active]);

  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: 36, display: "block", borderRadius: 8, background: "rgba(0,0,0,0.22)", border: "1px solid var(--hairline)" }}
        width={320}
        height={36}
      />
      <div className="flex items-center justify-between px-1">
        <span className="micro-label" style={{ fontSize: 8, color: active ? "var(--cyan)" : "var(--ink-faint)" }}>
          {active ? "Live • 16 bands • real-time" : "Idle • tap mic"}
        </span>
        <span className={`dot ${active ? "dot--cyan" : "dot--muted"}`} style={{ width: 6, height: 6 }} />
      </div>
    </div>
  );
}

export function MicButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-label={active ? "Stop listening" : "Start listening"}
      className="relative flex items-center justify-center shrink-0"
      style={{
        width: 56,
        height: 56,
        borderRadius: 999,
        background: active
          ? "radial-gradient(circle at 30% 28%, #22d3ee 0%, #0891b2 55%, #0e7490 100%)"
          : "radial-gradient(circle at 30% 28%, #1e232c 0%, #000000 70%)",
        border: `1px solid ${active ? "rgba(6,182,214,0.55)" : "rgba(255,255,255,0.09)"}`,
        boxShadow: active ? "0 0 0 5px rgba(6,182,214,0.14), 0 0 22px rgba(6,182,214,0.32), inset 0 1px 0 rgba(255,255,255,0.18)" : "inset 0 1px 0 rgba(255,255,255,0.06), 0 1px 2px rgba(0,0,0,0.5)",
        transition: "all 0.28s ease",
      }}
    >
      <span style={{ fontSize: 20, color: active ? "white" : "var(--ink-muted)", filter: active ? "drop-shadow(0 0 6px rgba(255,255,255,0.6))" : "none" }}>{active ? "◼" : "🎤"}</span>
      {active && <span className="absolute inset-0 rounded-full animate-ping" style={{ border: "1px solid rgba(6,182,214,0.35)" }} />}
    </button>
  );
}
