import { useEffect, useRef, useState } from 'react';
import '../App.css';
import { Led } from '../components/ui/Led';
import { Toggle } from '../components/ui/Toggle';
import { handleSpeakResponse } from '../features/voice/voiceService';
import { useVoiceCapture } from '../features/voice/useVoiceCapture';
import { NODE_RED_WS_PATHS, closeNodeRedSocket, getNodeRedSocket, sendNodeRedMessage } from '../services/nodeRedWebSocket';

function App() {
  const [darkMode, setDarkMode] = useState(() => {
    const savedTheme = window.localStorage.getItem('theme');
    if (savedTheme) return savedTheme === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    window.localStorage.setItem('theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const [machineOn, setMachineOn] = useState(true);
  const [oee, setOee] = useState(0);
  const [availability] = useState(100);
  const [performance] = useState(97);
  const [quality, setQuality] = useState(0);
  const [slNo, setSlNo] = useState(1);
  const [item, setItem] = useState('Solid_Plate');
  const [setQty, setSetQty] = useState(3);
  const [dateTime, setDateTime] = useState(() => toLocalInputValue(new Date()));
  const [placeOrder, setPlaceOrder] = useState(true);
  const [orderStatus, setOrderStatus] = useState('Order Placed');
  const [resetState, setResetState] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [qtyReq, setQtyReq] = useState(3);
  const [rmQty] = useState(1);
  const [produced, setProduced] = useState(0);
  const [productionOn] = useState(true);
  const [plannedAt, setPlannedAt] = useState(new Date());
  const [now, setNow] = useState(new Date());
  const [stop, setStop] = useState(false);
  const [perPartRs] = useState(2000);
  const [plannedRs] = useState(6000);
  const [badParts, setBadParts] = useState(0);
  const [loss, setLoss] = useState(0);

  const machineSocketRef = useRef(null);
  const speakSocketRef = useRef(null);
  const voiceSocketRef = useRef(null);
  const dashboardSocketRef = useRef(null);
  const stopSocketRef = useRef(null);
  const resetSocketRef = useRef(null);
  const placeOrderSocketRef = useRef(null);
  const dateTimeSocketRef = useRef(null);

  const { listening: micListening, text: micInput, interim: micInterim, isInterim, setText: setMicInput, stop: stopVoiceCapture } = useVoiceCapture({
    enabled: micEnabled,
    onResult: async (transcript, isFinal) => {
      if (!isFinal) {
        console.log('[App /ws/speak] interim:', transcript);
        return;
      }
      const payload = { device: 'speak', value: transcript, text: transcript, source: 'dashboard' };
      const ok = sendNodeRedMessage(NODE_RED_WS_PATHS.speak, payload);
      console.log('[App /ws/speak] send', ok ? 'queued/sent' : 'failed', payload);
    },
  });

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // --- INDEPENDENT WS: /ws/machine ---
  useEffect(() => {
    const socket = getNodeRedSocket(NODE_RED_WS_PATHS.machine, {
      onopen: () => console.log('[App] /ws/machine connected'),
      onmessage: (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.device === 'machine') {
            console.log('[App /ws/machine] recv:', payload);
            setMachineOn(Boolean(payload.value));
          }
        } catch (_e) { void _e; }
      },
    });
    machineSocketRef.current = socket;
    return () => closeNodeRedSocket(NODE_RED_WS_PATHS.machine);
  }, []);

  // --- INDEPENDENT WS: /ws/speak (dashboard -> Node-RED STT) ---
  useEffect(() => {
    const socket = getNodeRedSocket(NODE_RED_WS_PATHS.speak, {
      onopen: () => console.log('[App] /ws/speak connected'),
      onmessage: (event) => console.log('[App /ws/speak] echo recv:', event.data),
      onerror: (e) => console.error('[App /ws/speak] error:', e),
      onclose: () => console.log('[App /ws/speak] closed'),
    });
    speakSocketRef.current = socket;
    return () => closeNodeRedSocket(NODE_RED_WS_PATHS.speak);
  }, []);

  // --- INDEPENDENT WS: /ws/voice (Node-RED -> dashboard TTS) ---
  useEffect(() => {
    const socket = getNodeRedSocket(NODE_RED_WS_PATHS.voice, {
      onopen: () => console.log('[App] /ws/voice connected'),
      onmessage: async (event) => {
        console.log('[App /ws/voice] raw:', event.data);
        let payload;
        try {
          payload = JSON.parse(event.data);
        } catch {
          payload = event.data;
        }
        const text = payload?.value ?? payload?.text ?? payload?.payload ?? (typeof payload === 'string' ? payload : '');
        if (text && typeof text === 'string') setMicInput(text);
        await handleSpeakResponse(payload);
      },
      onerror: (e) => console.error('[App /ws/voice] error:', e),
      onclose: () => console.log('[App /ws/voice] closed'),
    });
    voiceSocketRef.current = socket;
    return () => closeNodeRedSocket(NODE_RED_WS_PATHS.voice);
  }, [setMicInput]);

  // --- INDEPENDENT WS: /ws/dashboard (only order data) ---
  useEffect(() => {
    const socket = getNodeRedSocket(NODE_RED_WS_PATHS.dashboard, {
      onopen: () => console.log('[App] /ws/dashboard connected'),
      onmessage: (event) => {
        try {
          const payload = JSON.parse(event.data);
          console.log('[App /ws/dashboard] recv:', payload);
          // Only handle order – placeOrder/stop/reset are handled by their own WS
          if (payload.device === 'order') {
            const nextMessage = payload.value ?? payload;
            if (typeof nextMessage.slNo === 'number') setSlNo(nextMessage.slNo);
            if (nextMessage.item) setItem(nextMessage.item);
            if (typeof nextMessage.setQty === 'number') setSetQty(nextMessage.setQty);
            if (nextMessage.dateTime) setDateTime(nextMessage.dateTime);
          }
        } catch (_e) { void _e; }
      },
    });
    dashboardSocketRef.current = socket;
    return () => closeNodeRedSocket(NODE_RED_WS_PATHS.dashboard);
  }, []);

  // --- INDEPENDENT WS: /ws/stop ---
  useEffect(() => {
    const socket = getNodeRedSocket(NODE_RED_WS_PATHS.stop, {
      onopen: () => console.log('[App] /ws/stop connected'),
      onmessage: (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.device === 'stop') {
            console.log('[App /ws/stop] recv:', payload);
            setStop(Boolean(payload.value));
          }
        } catch (_e) { void _e; }
      },
    });
    stopSocketRef.current = socket;
    return () => closeNodeRedSocket(NODE_RED_WS_PATHS.stop);
  }, []);

  // --- INDEPENDENT WS: /ws/reset ---
  useEffect(() => {
    const socket = getNodeRedSocket(NODE_RED_WS_PATHS.reset, {
      onopen: () => console.log('[App] /ws/reset connected'),
      onmessage: (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.device === 'reset') {
            console.log('[App /ws/reset] recv:', payload);
            setResetState(Boolean(payload.value));
          }
        } catch (_e) { void _e; }
      },
    });
    resetSocketRef.current = socket;
    return () => closeNodeRedSocket(NODE_RED_WS_PATHS.reset);
  }, []);

  // --- INDEPENDENT WS: /ws/placeOrder ---
  useEffect(() => {
    const socket = getNodeRedSocket(NODE_RED_WS_PATHS.placeOrder, {
      onopen: () => console.log('[App] /ws/placeOrder connected'),
      onmessage: (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.device === 'placeOrder') {
            console.log('[App /ws/placeOrder] recv:', payload);
            setPlaceOrder(Boolean(payload.value));
          }
        } catch (_e) { void _e; }
      },
    });
    placeOrderSocketRef.current = socket;
    return () => closeNodeRedSocket(NODE_RED_WS_PATHS.placeOrder);
  }, []);

  // --- INDEPENDENT WS: /ws/dateTime ---
  useEffect(() => {
    const socket = getNodeRedSocket(NODE_RED_WS_PATHS.dateTime, {
      onopen: () => console.log('[App] /ws/dateTime connected'),
      onmessage: (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.device === 'dateTime') {
            console.log('[App /ws/dateTime] recv:', payload);
            setDateTime(payload.value);
          }
        } catch (_e) { void _e; }
      },
    });
    dateTimeSocketRef.current = socket;
    return () => closeNodeRedSocket(NODE_RED_WS_PATHS.dateTime);
  }, []);

  useEffect(() => {
    if (!machineOn) return;
    const id = setInterval(() => {
      setQuality((q) => Math.min(100, q + Math.random() * 3));
      setOee((availability * performance * quality) / 10000);
      setProduced((p) => (p < qtyReq ? p + (Math.random() > 0.7 ? 1 : 0) : p));
    }, 1500);
    return () => clearInterval(id);
  }, [machineOn, availability, performance, quality, qtyReq]);

  // Only used for order submission – not for mirroring other WS
  const sendDashboardOrder = (extraPayload) => {
    const payload = { device: 'order', value: extraPayload };
    const ok = sendNodeRedMessage(NODE_RED_WS_PATHS.dashboard, payload);
    console.log('[App /ws/dashboard] send order', ok ? 'queued/sent' : 'failed', payload);
    return ok;
  };

  const handleSubmit = () => {
    const nextPlannedAt = new Date(dateTime);
    setPlannedAt(nextPlannedAt);
    setQtyReq(setQty);

    const dtPayload = { device: 'dateTime', value: dateTime };
    const okDt = sendNodeRedMessage(NODE_RED_WS_PATHS.dateTime, dtPayload);
    console.log('[App /ws/dateTime] send', okDt ? 'queued/sent' : 'failed', dtPayload);

    sendDashboardOrder({
      slNo,
      item,
      setQty,
      dateTime,
      plannedAt: nextPlannedAt.toISOString(),
    });
  };

  const handleReset = () => {
    setProduced(0);
    setBadParts(0);
    setLoss(0);
    setStop(false);
    setOrderStatus('Order Placed');
    setResetState(false);

    const payload = { device: 'reset', value: true };
    const ok = sendNodeRedMessage(NODE_RED_WS_PATHS.reset, payload);
    console.log('[App /ws/reset] send', ok ? 'queued/sent' : 'failed', payload);
  };

  const elapsedLabel = now.toLocaleTimeString('en-GB', { hour12: false });
  const debugSlNoItem = `${slNo} · ${item}`;
  const plannedLabel = plannedAt
    .toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    .replace(/\//g, '/') + ' ' + plannedAt.toLocaleTimeString('en-GB', { hour12: false });

  return (
    <div className="page">
      <div className="card">
        <header className="app-header">
          <div>
            <p className="eyebrow">Overview</p>
            <h1 className="app-title">SamAI Dashboard</h1>
          </div>
          <button
            type="button"
            className="theme-toggle"
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => setDarkMode((current) => !current)}
          >
            <span className="theme-toggle-icon" aria-hidden="true">
              {darkMode ? '☀️' : '🌙'}
            </span>
            <span>{darkMode ? 'Light' : 'Dark'}</span>
          </button>
        </header>

        <div className="section row machine-row-header" style={{ alignItems: 'center' }}>
          <div className="machine-toggle">
            <p className="eyebrow">Machine</p>
            <Toggle
              on={machineOn}
              onChange={(newValue) => {
                setMachineOn(newValue);
                const ok = sendNodeRedMessage(NODE_RED_WS_PATHS.machine, { device: 'machine', value: newValue });
                console.log('[App /ws/machine] send', ok ? 'queued/sent' : 'failed', newValue);
              }}
            />
          </div>

          <Led label="On/Off" on={machineOn} />
          <Led label="Production" on={productionOn} />
        </div>

        <div className="section metrics-grid">
          <div><p className="metric-label">Availability</p><p className="metric-value">{availability.toFixed(0)}</p></div>
          <div><p className="metric-label">Performance</p><p className="metric-value">{performance.toFixed(0)}</p></div>
          <div><p className="metric-label">Quality</p><p className="metric-value">{quality.toFixed(0)}</p></div>
          <div><p className="metric-label">OEE</p><p className="metric-value">{oee.toFixed(0)}</p></div>
        </div>

        <div className="section">
          <div className="row order-row" style={{ alignItems: 'flex-end', gap: 16 }}>
            <div style={{ width: 90 }}>
              <p className="field-label">Sl No.</p>
              <input
                className="input"
                type="number"
                min="1"
                value={slNo}
                onChange={(e) => {
                  const nextSlNo = Number(e.target.value) || 1;
                  setSlNo(nextSlNo);
                  // independent: local only, sent on Submit via /ws/dashboard
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <p className="field-label">Item</p>
              <select
                className="select"
                value={item}
                onChange={(e) => {
                  const nextItem = e.target.value;
                  setItem(nextItem);
                }}
              >
                <option value="Solid_Plate">1 · Solid_Plate</option>
                <option value="Hollow_Plate">2 · Hollow_Plate</option>
                <option value="Bracket">3 · Bracket</option>
              </select>
            </div>
            <div style={{ width: 90 }}>
              <p className="field-label">Set Qty</p>
              <input
                className="input"
                type="number"
                min="0"
                value={setQty}
                onChange={(e) => {
                  const nextQty = Number(e.target.value) || 0;
                  setSetQty(nextQty);
                }}
              />
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <p className="field-label">Select Date and Time (IST)</p>
            <div className="row datetime-row" style={{ gap: 12 }}>
              <input
                className="datetime"
                type="datetime-local"
                value={dateTime}
                onChange={(e) => {
                  const nextDateTime = e.target.value;
                  setDateTime(nextDateTime);
                }}
              />
              <button className="btn btn-primary" onClick={handleSubmit}>Submit</button>
            </div>
          </div>
        </div>

        <div className="section row">
          <div>
            <p className="eyebrow">Place Order</p>
            <Toggle
              on={placeOrder}
              onChange={(newValue) => {
                setPlaceOrder(newValue);
                setOrderStatus(newValue ? 'Order Placed' : 'Order Cancelled');
                const ok = sendNodeRedMessage(NODE_RED_WS_PATHS.placeOrder, { device: 'placeOrder', value: newValue });
                console.log('[App /ws/placeOrder] send', ok ? 'queued/sent' : 'failed', newValue);
              }}
            />
          </div>
          <div style={{ textAlign: 'right' }}>
            <p className="eyebrow">Status</p>
            <p className="status-pill">{placeOrder ? orderStatus : 'Not Placed'}</p>
          </div>
        </div>

        <div className="section row">
          <p>Planned: <b>{plannedLabel}</b></p>
          <p className="timer-live">{elapsedLabel}</p>
        </div>

        <div className="section row">
          <div>
            <p className="eyebrow">Stop</p>
            <Toggle
              on={stop}
              onChange={(newValue) => {
                setStop(newValue);
                const ok = sendNodeRedMessage(NODE_RED_WS_PATHS.stop, { device: 'stop', value: newValue });
                console.log('[App /ws/stop] send', ok ? 'queued/sent' : 'failed', newValue);
              }}
            />
          </div>
          <button className="btn btn-success" onClick={handleReset}>Reset</button>
        </div>

        <div className="section metrics-row-spread">
          <div><p className="metric-label">Required QTY</p><p className="metric-value">{qtyReq}</p></div>
          <div><p className="metric-label">Raw Material</p><p className="metric-value">{rmQty}</p></div>
          <div><p className="metric-label">Produced QTY</p><p className="metric-value">{produced}</p></div>
        </div>

        <div className="section cost-grid">
          <div><p className="metric-label">Per Part (Rs)</p><p className="metric-value">{perPartRs}</p></div>
          <div><p className="metric-label">Planned (Rs)</p><p className="metric-value">{plannedRs}</p></div>
          <div><p className="metric-label">Bad Parts</p><p className="metric-value">{badParts}</p></div>
          <div><p className="metric-label">Loss</p><p className="metric-value">{loss}</p></div>
        </div>

        <div className="section debug-section">
          <p className="eyebrow">Debug / Messages</p>
          <div className="debug-actions">
            <div className="voice-controls">
              <button
                type="button"
                className={micListening ? 'btn btn-success' : 'btn btn-primary'}
                onClick={() => {
                  console.log('[App] Speak button clicked. Current enabled:', micEnabled, '-> toggling to:', !micEnabled);
                  setMicEnabled((current) => !current);
                }}
              >
                {micListening ? 'Listening...' : 'Speak'}
              </button>
              {micListening && <span className="voice-indicator" aria-label="Listening" />}
            </div>
            {micEnabled && (
              <button type="button" className="btn btn-danger" onClick={stopVoiceCapture}>Stop Voice</button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              style={{ fontSize: 12, padding: '8px 10px' }}
              onClick={async () => {
                const t = 'Hi, How are you?';
                setMicInput(t);
                console.log('[App] Test TTS:', t);
                await handleSpeakResponse({ device: 'voice', value: t, text: t, source: 'node-red' });
              }}
              title="Test /ws/voice TTS without Node-RED"
            >
              Test Voice
            </button>
          </div>
          <div className="debug-output">
            <div className="debug-line">Machine: <span className="debug-value">{machineOn.toString()}</span></div>
            <div className="debug-line">Place Order: <span className="debug-value">{placeOrder.toString()}</span></div>
            <div className="debug-line">Date/Time: <span className="debug-value">{dateTime}</span></div>
            <div className="debug-line">Stop: <span className="debug-value">{stop.toString()}</span></div>
            <div className="debug-line">Reset: <span className="debug-value">{resetState.toString()}</span></div>
            <div className="debug-line">Set Qty: <span className="debug-value">{setQty}</span></div>
            <div className="debug-line">SlNo. / Item: <span className="debug-value">{debugSlNoItem}</span></div>
            <div className="debug-line">Mic Input: <span className={`debug-value mic-text ${isInterim ? 'is-interim' : 'is-final'}`}>{micInput ? (isInterim ? `${micInput}` : micInput) : 'No input yet'}</span>{isInterim && micInterim && <span className="mic-interim-hint">● listening</span>}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default App;
