import { speakNodeRedText } from "@/lib/deepgram";
import { NODE_RED_WS_PATHS, sendNodeRedMessage } from "@/lib/nodeRedWebSocket";

export function sendVoiceToNodeRed(transcript: string): boolean {
  if (!transcript?.trim()) return false;
  const payload = { device: "speak", value: transcript, text: transcript, source: "dashboard" };
  console.log("[voiceService] Sending STT to Node-RED /ws/speak:", payload);
  return sendNodeRedMessage(NODE_RED_WS_PATHS.speak, payload);
}

export function normalizeVoicePayload(raw: unknown): Record<string, string> | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    try {
      const parsed = JSON.parse(t);
      return normalizeVoicePayload(parsed);
    } catch {
      return { device: "voice", value: t, text: t, source: "node-red" };
    }
  }
  if (typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    const text = (r.value ?? r.text ?? r.payload ?? r.data ?? r.message ?? "") as string;
    if (!text || typeof text !== "string" || !text.trim()) return null;
    return {
      ...(r as Record<string, string>),
      device: (r.device as string) || "voice",
      event: r.event as string,
      value: text.trim(),
      text: text.trim(),
      source: (r.source as string) || "node-red",
    };
  }
  return null;
}

export async function handleSpeakResponse(rawPayload: unknown): Promise<boolean> {
  const payload = normalizeVoicePayload(rawPayload);
  console.log("[voiceService] handleSpeakResponse raw:", rawPayload, "normalized:", payload);
  if (!payload) {
    console.warn("[voiceService] No text in voice payload – ignoring");
    return false;
  }
  if (payload.source === "dashboard") {
    console.log("[voiceService] Ignoring echo from dashboard");
    return false;
  }
  const text = payload.text || payload.value;
  if (!text?.trim()) return false;
  try {
    console.log("[voiceService] Playing TTS:", text.slice(0, 80));
    const audio = await speakNodeRedText({ text });
    console.log("[voiceService] TTS started:", audio);
    return true;
  } catch (err) {
    console.error("[voiceService] TTS playback failed:", err);
    return false;
  }
}
