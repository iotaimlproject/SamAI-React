import { useEffect, useRef, useState } from 'react';
import './App.css';
import { Led } from './components/ui/Led';
import { Toggle } from './components/ui/Toggle';
import { handleSpeakResponse } from './features/voice/voiceService';
import { useVoiceCapture } from './features/voice/useVoiceCapture';
import { closeNodeRedSocket, getNodeRedSocket, sendNodeRedMessage } from './services/nodeRedWebSocket';

function App() {
  const [darkMode, setDarkMode] = useState(() => {
    const savedTheme = window.localStorage.getItem('theme');
    if (savedTheme) {
      return savedTheme === 'dark';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    window.localStorage.setItem('theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const [machineOn, setMachineOn] = useState(true);
  const [oee, setOee] = useState(0);
  const [availability, setAvailability] = useState(100);
  const [performance, setPerformance] = useState(97);
  const [quality, setQuality] = useState(0);

  const [slNo, setSlNo] = useState(1);
  const [item, setItem] = useState('Solid_Plate');
  const [setQty, setSetQty] = useState(3);
  const [dateTime, setDateTime] = useState(() => toLocalInputValue(new Date()));

  const [placeOrder, setPlaceOrder] = useState(true);
  const [orderStatus, setOrderStatus] = useState('Order Placed');
  const [resetState, setResetState] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const voiceSessionRef = useRef(null);
  const machineSocketRef = useRef(null);
  const speakSocketRef = useRef(null);
  const dashboardSocketRef = useRef(null);
  const stopSocketRef = useRef(null);
  const resetSocketRef = useRef(null);
  const placeOrderSocketRef = useRef(null);
  const dateTimeSocketRef = useRef(null);

  const [qtyReq, setQtyReq] = useState(3);
  const [rmQty, setRmQty] = useState(1);
  const [produced, setProduced] = useState(0);

  const [productionOn, setProductionOn] = useState(true);

  const [plannedAt, setPlannedAt] = useState(new Date());
  const [now, setNow] = useState(new Date());

  const [stop, setStop] = useState(false);
  const [perPartRs, setPerPartRs] = useState(2000);
  const [plannedRs, setPlannedRs] = useState(6000);
  const [badParts, setBadParts] = useState(0);
  const [loss, setLoss] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const socket = getNodeRedSocket('/ws/machine', {
      onopen: () => console.log('Connected to Node-RED websocket machine'),
      onmessage: (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.device === 'machine') {
            setMachineOn(Boolean(payload.value));
          }
        } catch (error) {
          console.error('Invalid Node-RED message:', event.data);
        }
      },
      onerror: (error) => {
        console.error('Node-RED machine websocket error:', error);
      },
    });

    machineSocketRef.current = socket;

    return () => {
      closeNodeRedSocket('/ws/machine');
    };
  }, []);

  const { listening: micListening, text: micInput, setText: setMicInput, stop: stopVoiceCapture } = useVoiceCapture({
    enabled: micEnabled,
    onResult: async (transcript, isFinal) => {
      if (!isFinal) return;
      const socket = getNodeRedSocket('/ws/speak');
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ device: 'speak', value: transcript, text: transcript, source: 'dashboard' }));
      } else {
        sendNodeRedMessage('/ws/speak', { device: 'speak', value: transcript, text: transcript, source: 'dashboard' });
      }
    },
  });

  useEffect(() => {
    const socket = getNodeRedSocket('/ws/voice', {
      onopen: () => console.log('Connected to Node-RED voice websocket'),
      onmessage: async (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.device === 'voice' || payload.event === 'tts') {
            const text = payload.value ?? payload.text ?? '';
            setMicInput(text);
            await handleSpeakResponse(payload);
          }
        } catch (error) {
          console.error('Invalid voice websocket message:', event.data);
        }
      },
      onerror: (error) => {
        console.error('Node-RED voice websocket error:', error);
      },
    });

    speakSocketRef.current = socket;

    return () => {
      closeNodeRedSocket('/ws/voice');
    };
  }, [setMicInput]);

  useEffect(() => {
    const socket = getNodeRedSocket('/ws/dashboard', {
      onopen: () => console.log('Connected to Node-RED dashboard websocket'),
      onmessage: (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.device === 'placeOrder' && typeof payload.value === 'boolean') {
            setPlaceOrder(Boolean(payload.value));
          }
          if (payload.device === 'stop' && typeof payload.value === 'boolean') {
            setStop(Boolean(payload.value));
          }
          if (payload.device === 'reset' && payload.value) {
            setResetState(true);
          }
          if (payload.device === 'order') {
            const nextMessage = payload.value ?? payload;
            if (typeof nextMessage.slNo === 'number') {
              setSlNo(nextMessage.slNo);
            }
            if (nextMessage.item) {
              setItem(nextMessage.item);
            }
            if (typeof nextMessage.setQty === 'number') {
              setSetQty(nextMessage.setQty);
            }
            if (nextMessage.dateTime) {
              setDateTime(nextMessage.dateTime);
            }
          }
        } catch (error) {
          console.error('Invalid dashboard websocket message:', event.data);
        }
      },
      onerror: (error) => {
        console.error('Node-RED dashboard websocket error:', error);
      },
    });

    dashboardSocketRef.current = socket;

    return () => {
      closeNodeRedSocket('/ws/dashboard');
    };
  }, []);

  useEffect(() => {
    const socket = getNodeRedSocket('/ws/stop', {
      onopen: () => console.log('Connected to Node-RED websocket stop'),
      onmessage: (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.device === 'stop') {
            setStop(Boolean(payload.value));
          }
        } catch (error) {
          console.error('Invalid stop websocket message:', event.data);
        }
      },
      onerror: (error) => {
        console.error('Node-RED stop websocket error:', error);
      },
    });

    stopSocketRef.current = socket;

    return () => {
      closeNodeRedSocket('/ws/stop');
    };
  }, []);

  useEffect(() => {
    const socket = getNodeRedSocket('/ws/reset', {
      onopen: () => console.log('Connected to Node-RED websocket reset'),
      onmessage: (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.device === 'reset') {
            setResetState(Boolean(payload.value));
          }
        } catch (error) {
          console.error('Invalid reset websocket message:', event.data);
        }
      },
      onerror: (error) => {
        console.error('Node-RED reset websocket error:', error);
      },
    });

    resetSocketRef.current = socket;

    return () => {
      closeNodeRedSocket('/ws/reset');
    };
  }, []);

  useEffect(() => {
    const socket = getNodeRedSocket('/ws/placeOrder', {
      onopen: () => console.log('Connected to Node-RED websocket placeOrder'),
      onmessage: (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.device === 'placeOrder') {
            setPlaceOrder(Boolean(payload.value));
          }
        } catch (error) {
          console.error('Invalid placeOrder websocket message:', event.data);
        }
      },
      onerror: (error) => {
        console.error('Node-RED placeOrder websocket error:', error);
      },
    });

    placeOrderSocketRef.current = socket;

    return () => {
      closeNodeRedSocket('/ws/placeOrder');
    };
  }, []);

  useEffect(() => {
    const socket = getNodeRedSocket('/ws/dateTime', {
      onopen: () => console.log('Connected to Node-RED websocket dateTime'),
      onmessage: (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.device === 'dateTime') {
            setDateTime(payload.value);
          }
        } catch (error) {
          console.error('Invalid dateTime websocket message:', event.data);
        }
      },
      onerror: (error) => {
        console.error('Node-RED dateTime websocket error:', error);
      },
    });

    dateTimeSocketRef.current = socket;

    return () => {
      closeNodeRedSocket('/ws/dateTime');
    };
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

  const sendDashboardPayload = (device, value, extraPayload = {}) => {
    const socket = dashboardSocketRef.current ?? getNodeRedSocket('/ws/dashboard');
    dashboardSocketRef.current = socket;

    const payload = { device, value, ...extraPayload };

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
      return;
    }

    sendNodeRedMessage('/ws/dashboard', payload);
  };

  const sendStopPayload = (value, extraPayload = {}) => {
    const socket = stopSocketRef.current ?? getNodeRedSocket('/ws/stop');
    stopSocketRef.current = socket;

    const payload = {
      device: 'stop',
      value,
      ...extraPayload,
    };

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
      return;
    }

    sendNodeRedMessage('/ws/stop', payload);
  };

  const handleSubmit = () => {
    const nextPlannedAt = new Date(dateTime);
    setPlannedAt(nextPlannedAt);
    setQtyReq(setQty);

    const socket = dateTimeSocketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ device: 'dateTime', value: dateTime }));
    }

    sendDashboardPayload('order', {
      slNo,
      item,
      setQty,
      dateTime,
      plannedAt: nextPlannedAt.toISOString(),
    });

    console.log('Submitted:', { slNo, item, setQty, dateTime });
  };

  const handleReset = () => {
    setProduced(0);
    setBadParts(0);
    setLoss(0);
    setStop(false);
    setOrderStatus('Order Placed');

    const socket = resetSocketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ device: 'reset', value: true }));
    }

    setResetState(false);

    sendDashboardPayload('reset', true, {
      slNo,
      item,
      setQty,
      dateTime,
      produced: 0,
      badParts: 0,
      loss: 0,
      stop: false,
    });
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

        {/* --- Machine On/Off + OEE, with both status LEDs right here --- */}
        <div className="section row machine-row-header" style={{ alignItems: 'center' }}>
          <div className="machine-toggle">
            <p className="eyebrow">Machine</p>
            <Toggle
              on={machineOn}
              onChange={(newValue) => {
                console.log('[MACHINE TOGGLE]', newValue);
                setMachineOn(newValue);

                const socket = machineSocketRef.current;
                if (socket && socket.readyState === WebSocket.OPEN) {
                  socket.send(JSON.stringify({ device: 'machine', value: newValue }));
                }
              }}
            />
          </div>

          <Led label="On/Off" on={machineOn} />

          <Led label="Production" on={productionOn} />
        </div>

        {/* --- Availability / Performance / Quality / OEE --- */}
        <div className="section metrics-grid">
          <div>
            <p className="metric-label">Availability</p>
            <p className="metric-value">{availability.toFixed(0)}</p>
          </div>
          <div>
            <p className="metric-label">Performance</p>
            <p className="metric-value">{performance.toFixed(0)}</p>
          </div>
          <div>
            <p className="metric-label">Quality</p>
            <p className="metric-value">{quality.toFixed(0)}</p>
          </div>
          <div>
            <p className="metric-label">OEE</p>
            <p className="metric-value">{oee.toFixed(0)}</p>
          </div>
        </div>

        {/* --- Order entry form --- */}
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
                sendDashboardPayload('slNo', nextSlNo, { item, setQty, dateTime });
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
                sendDashboardPayload('item', nextItem, { slNo, setQty, dateTime });
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
                sendDashboardPayload('quantity', nextQty, { slNo, item, dateTime });
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
                  sendDashboardPayload('dateTime', nextDateTime, { slNo, item, setQty });
                }}
              />
              <button className="btn btn-primary" onClick={handleSubmit}>
                Submit
              </button>
            </div>
          </div>
        </div>

        {/* --- Place order --- */}
        <div className="section row">
          <div>
            <p className="eyebrow">Place Order</p>
            <Toggle
              on={placeOrder}
              onChange={(newValue) => {
                setPlaceOrder(newValue);
                setOrderStatus(newValue ? 'Order Placed' : 'Order Cancelled');

                const socket = placeOrderSocketRef.current;
                if (socket && socket.readyState === WebSocket.OPEN) {
                  socket.send(JSON.stringify({ device: 'placeOrder', value: newValue }));
                }

                sendDashboardPayload('placeOrder', newValue, {
                  status: newValue ? 'Order Placed' : 'Not Placed',
                  slNo,
                  item,
                  setQty,
                  dateTime,
                });
              }}
            />
          </div>
          <div style={{ textAlign: 'right' }}>
            <p className="eyebrow">Status</p>
            <p className="status-pill">{placeOrder ? orderStatus : 'Not Placed'}</p>
          </div>
        </div>

        {/* --- Timer --- */}
        <div className="section row">
          <p>
            Planned: <b>{plannedLabel}</b>
          </p>
          <p className="timer-live">{elapsedLabel}</p>
        </div>

        {/* --- Stop / Reset --- */}
        <div className="section row">
          <div>
            <p className="eyebrow">Stop</p>
            <Toggle
              on={stop}
              onChange={(newValue) => {
                setStop(newValue);

                const socket = stopSocketRef.current;
                if (socket && socket.readyState === WebSocket.OPEN) {
                  socket.send(JSON.stringify({ device: 'stop', value: newValue }));
                }

                sendStopPayload(newValue, {
                  slNo,
                  item,
                  setQty,
                  dateTime,
                });
                sendDashboardPayload('stop', newValue, {
                  slNo,
                  item,
                  setQty,
                  dateTime,
                });
              }}
            />
          </div>
          <button className="btn btn-success" onClick={handleReset}>
            Reset
          </button>
        </div>

        {/* --- Qty Req / RM Qty / Produced --- */}
        <div className="section metrics-row-spread">
          <div>
            <p className="metric-label">Required QTY</p>
            <p className="metric-value">{qtyReq}</p>
          </div>
          <div>
            <p className="metric-label">Raw Material</p>
            <p className="metric-value">{rmQty}</p>
          </div>
          <div>
            <p className="metric-label">Produced QTY</p>
            <p className="metric-value">{produced}</p>
          </div>
        </div>

        {/* --- Cost summary --- */}
        <div className="section cost-grid">
          <div>
            <p className="metric-label">Per Part (Rs)</p>
            <p className="metric-value">{perPartRs}</p>
          </div>
          <div>
            <p className="metric-label">Planned (Rs)</p>
            <p className="metric-value">{plannedRs}</p>
          </div>
          <div>
            <p className="metric-label">Bad Parts</p>
            <p className="metric-value">{badParts}</p>
          </div>
          <div>
            <p className="metric-label">Loss</p>
            <p className="metric-value">{loss}</p>
          </div>
        </div>

        {/* --- Debug / Messages --- */}
        <div className="section debug-section">
          <p className="eyebrow">Debug / Messages</p>
          <div className="debug-actions">
            <div className="voice-controls">
             <button
               type="button"
               className={micListening ? 'btn btn-success' : 'btn btn-primary'}
               onClick={() => setMicEnabled((current) => !current)}
             >
               {micListening ? 'Listening...' : 'Speak'}
             </button>
             {micListening && <span className="voice-indicator" aria-label="Listening" />}
            </div>
            {micEnabled && (
             <button type="button" className="btn btn-danger" onClick={stopVoiceCapture}>
               Stop Voice
             </button>
            )}
          </div>
          <div className="debug-output">
            <div className="debug-line">
              Machine: <span className="debug-value">{machineOn.toString()}</span>
            </div>
            <div className="debug-line">
              Place Order: <span className="debug-value">{placeOrder.toString()}</span>
            </div>
            <div className="debug-line">
              Date/Time: <span className="debug-value">{dateTime}</span>
            </div>
            <div className="debug-line">
              Stop: <span className="debug-value">{stop.toString()}</span>
            </div>
            <div className="debug-line">
              Reset: <span className="debug-value">{resetState.toString()}</span>
            </div>
            <div className="debug-line">
              Set Qty: <span className="debug-value">{setQty}</span>
            </div>
            <div className="debug-line">
              SlNo. / Item: <span className="debug-value">{debugSlNoItem}</span>
            </div>
            <div className="debug-line">
              Mic Input: <span className="debug-value">{micInput || 'No input yet'}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// Helper: format a Date as the string <input type="datetime-local"> expects
function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export default App;
