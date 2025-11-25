import React, { useState, useEffect, useRef } from "react";
import { BarChart3, Skull, Ship, Sparkles, Users, Play } from "lucide-react";
import * as THREE from "three";
import { renderToStaticMarkup } from "react-dom/server";

export default function CatanDiceRoller() {
  // ---------- UI state (unchanged behavior) ----------
  const [die1, setDie1] = useState(null);
  const [die2, setDie2] = useState(null);
  const [eventDie, setEventDie] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [stats, setStats] = useState({});
  const [eventStats, setEventStats] = useState({
    barbarian: 0,
    trade: 0,
    science: 0,
    politics: 0,
  });
  const [showEventDie, setShowEventDie] = useState(true);
  const [showTestControls, setShowTestControls] = useState(false);
  const [testRolls, setTestRolls] = useState(100);
  const [simulating, setSimulating] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState({
    redDieColor: "#ef4444",
    yellowDieColor: "#fbbf24",
    eventDieColor: "#64748b",
    themeColor: "#4f46e5",
    rollDuration: 1000,
  });

  // ---------- event face definitions (unchanged) ----------
  const eventDieFaces = [
    { type: "barbarian", color: "#111827", label: "Barbarian", icon: Skull },
    { type: "barbarian", color: "#111827", label: "Barbarian", icon: Skull },
    { type: "barbarian", color: "#111827", label: "Barbarian", icon: Skull },
    { type: "trade", color: "#FBBF24", label: "Trade", icon: Ship },
    { type: "science", color: "#34D399", label: "Science", icon: Sparkles },
    { type: "politics", color: "#3B82F6", label: "Politics", icon: Users },
  ];


  // ---------- DOM refs ----------is
  const canvasRef1 = useRef(null);
  const canvasRef2 = useRef(null);
  const canvasRefEvent = useRef(null);

  // ---------- Scene refs (store scene + cube + renderer objects) ----------
  const sceneRef1 = useRef(null);
  const sceneRef2 = useRef(null);
  const sceneRefEvent = useRef(null);

  // ---------- Helpers: dot positions ----------
  const getDotPositionsForFace = (num) => {
    const positions = {
      1: [[0.5, 0.5]],
      2: [
        [0.3, 0.3],
        [0.7, 0.7],
      ],
      3: [
        [0.3, 0.3],
        [0.5, 0.5],
        [0.7, 0.7],
      ],
      4: [
        [0.3, 0.3],
        [0.7, 0.3],
        [0.3, 0.7],
        [0.7, 0.7],
      ],
      5: [
        [0.3, 0.3],
        [0.7, 0.3],
        [0.5, 0.5],
        [0.3, 0.7],
        [0.7, 0.7],
      ],
      6: [
        [0.3, 0.3],
        [0.7, 0.3],
        [0.3, 0.5],
        [0.7, 0.5],
        [0.3, 0.7],
        [0.7, 0.7],
      ],
    };
    return positions[num] || [];
  };

  const cleanupScene = (sceneData) => {
    if (!sceneData) return;
    try {
      sceneData.dispose();
    } catch (e) {
      // ignore
    }
  };

  // ---------- Centralized renderer factory ----------
  // ensures consistent renderer config (color space, toneMapping, size)
  const createRenderer = (canvas) => {
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });

    renderer.setSize(112, 112, false);
    renderer.setClearColor(0x000000, 0);
    if ("outputColorSpace" in renderer) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else {
      renderer.outputEncoding = THREE.sRGBEncoding;
    }
    renderer.toneMapping = THREE.NoToneMapping;

    return renderer;
  };

  // ---------- Centralized texture factory (applies sRGB) ----------
  const makeCanvasTextureFrom = (canvas) => {
    const tex = new THREE.CanvasTexture(canvas);
    // modern Three.js uses texture.colorSpace; fallback to .encoding
    if ("colorSpace" in tex) {
      tex.colorSpace = THREE.SRGBColorSpace;
    } else {
      tex.encoding = THREE.sRGBEncoding;
    }
    tex.needsUpdate = true;
    return tex;
  };

  // create dot texture with background color and white dots
  const createDotTexture = (num, bgColor) => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = "white";
    const dots = getDotPositionsForFace(num);
    dots.forEach((pos) => {
      ctx.beginPath();
      ctx.arc(pos[0] * 256, pos[1] * 256, 20, 0, Math.PI * 2);
      ctx.fill();
    });

    return makeCanvasTextureFrom(canvas);
  };

  const createEventFaceTexture = (face) => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");

    // Draw background
    ctx.fillStyle = face.color;
    ctx.fillRect(0, 0, 256, 256);

    // ---- Render Lucide Icon into SVG string ----
    const svgString = renderToStaticMarkup(
      React.createElement(face.icon, {
        size: 180,
        color: "white",
        strokeWidth: 2
      })
    );

    const img = new Image();
    const texture = new THREE.CanvasTexture(canvas);

    img.onload = () => {
      // Draw centered icon
      const x = (256 - img.width) / 2;
      const y = (256 - img.height) / 2;
      ctx.drawImage(img, x, y);
      texture.needsUpdate = true;
    };

    // Set SVG as <img> source
    img.src = "data:image/svg+xml;base64," + btoa(svgString);

    return texture;
  };



  const createDiceScene = (canvas, color, isEventDie = false) => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    const renderer = createRenderer(canvas);

    camera.position.set(0, 4, 0);
    camera.lookAt(0, 0, 0);

    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const materials = [];

    if (!isEventDie) {
      for (let i = 1; i <= 6; i++) {
        const tex = createDotTexture(i, color);
        materials.push(new THREE.MeshBasicMaterial({ map: tex }));
      }
    } else {
      // event die: start with white materials, apply texture only to top when needed
      for (let i = 0; i < 6; i++) {
        materials.push(
          new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: false,
            opacity: 1,
            map: null,
          })
        );
      }
    }

    const cube = new THREE.Mesh(geometry, materials);
    scene.add(cube);

    // edges for clarity
    const edges = new THREE.EdgesGeometry(geometry);
    const edgeLines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));
    cube.add(edgeLines);

    let isSpinning = false;
    let animationId = null;

    const animate = () => {
      if (isSpinning) {
        cube.rotation.x += 0.2;
        cube.rotation.y += 0.2;
        cube.rotation.z += 0.2;
      }
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    };
    animate();

    return {
      scene,
      cube,
      renderer,
      camera,
      animationId,
      dispose: () => {
        // stop animation and dispose renderer resources
        if (animationId) cancelAnimationFrame(animationId);
        try {
          renderer.dispose();
        } catch (e) {
          // ignore
        }
      },
      setSpinning: (val) => {
        isSpinning = !!val;
      },
    };
  };

  // ---------- Update functions ----------
  const setTopFaceTexture = (cube, texture) => {
    if (!Array.isArray(cube.material)) return;
    cube.material[2].map = texture;
    cube.material[2].map && (cube.material[2].map.needsUpdate = true);
    cube.material[2].needsUpdate = true;
  };

  const updateDiceFace = (sceneData, value, isRolling, color) => {
    if (!sceneData) return;
    const { cube, setSpinning } = sceneData;
    if (isRolling) {
      setSpinning(true);
      return;
    }
    setSpinning(false);
    const topTexture = createDotTexture(value, color);
    setTopFaceTexture(cube, topTexture);
    cube.rotation.set(0, 0, 0);
  };

  const updateEventDiceFace = (sceneData, faceIndex, isRolling) => {
    if (!sceneData) return;
    const { cube, setSpinning } = sceneData;

    if (isRolling) {
      setSpinning(true);

      // Apply random textures to all 6 faces for rolling effect
      cube.material.forEach((mat, i) => {
        const randomFace = eventDieFaces[Math.floor(Math.random() * eventDieFaces.length)];
        const tex = createEventFaceTexture(randomFace);
        mat.map = tex;
        mat.needsUpdate = true;
      });

      return;
    }

    // Stop spinning, set final face
    setSpinning(false);
    const face = eventDieFaces[faceIndex];
    const tex = createEventFaceTexture(face);
    setTopFaceTexture(cube, tex);
    cube.rotation.set(0, 0, 0);
  };

  useEffect(() => {
    // create/recreate first die
    if (canvasRef1.current) {
      cleanupScene(sceneRef1.current);
      sceneRef1.current = createDiceScene(canvasRef1.current, settings.redDieColor, false);
    }
    // create/recreate second die
    if (canvasRef2.current) {
      cleanupScene(sceneRef2.current);
      sceneRef2.current = createDiceScene(canvasRef2.current, settings.yellowDieColor, false);
    }
    // create/recreate event die if shown
    if (canvasRefEvent.current && showEventDie) {
      cleanupScene(sceneRefEvent.current);
      sceneRefEvent.current = createDiceScene(canvasRefEvent.current, settings.eventDieColor, true);
    } else {
      // if not showing event die, ensure it's cleaned up
      cleanupScene(sceneRefEvent.current);
      sceneRefEvent.current = null;
    }

    // return cleanup on unmount
    return () => {
      cleanupScene(sceneRef1.current);
      cleanupScene(sceneRef2.current);
      cleanupScene(sceneRefEvent.current);
      sceneRef1.current = null;
      sceneRef2.current = null;
      sceneRefEvent.current = null;
    };
  }, [settings.redDieColor, settings.yellowDieColor, settings.eventDieColor, showEventDie]);

  useEffect(() => {
    if (die1 !== null && sceneRef1.current) {
      updateDiceFace(sceneRef1.current, die1, rolling, settings.redDieColor);
    }
  }, [die1, rolling, settings.redDieColor]);

  useEffect(() => {
    if (die2 !== null && sceneRef2.current) {
      updateDiceFace(sceneRef2.current, die2, rolling, settings.yellowDieColor);
    }
  }, [die2, rolling, settings.yellowDieColor]);

  useEffect(() => {
    if (eventDie !== null && sceneRefEvent.current) {
      updateEventDiceFace(sceneRefEvent.current, eventDie, rolling);
    }
  }, [eventDie, rolling]);

  const rollDice = () => {
    setRolling(true);

    const interval = setInterval(() => {
      setDie1(Math.floor(Math.random() * 6) + 1);
      setDie2(Math.floor(Math.random() * 6) + 1);
      if (showEventDie) {
        setEventDie(Math.floor(Math.random() * 6)); // temporary random index for updating textures
        if (sceneRefEvent.current) {
          updateEventDiceFace(sceneRefEvent.current, 0, true); // pass any index, isRolling = true
        }
      }
    }, 50);

    setTimeout(() => {
      clearInterval(interval);
      const finalDie1 = Math.floor(Math.random() * 6) + 1;
      const finalDie2 = Math.floor(Math.random() * 6) + 1;
      const finalEvent = showEventDie ? Math.floor(Math.random() * 6) : null;

      setDie1(finalDie1);
      setDie2(finalDie2);
      if (showEventDie) {
        setEventDie(finalEvent);
        if (sceneRefEvent.current) {
          updateEventDiceFace(sceneRefEvent.current, finalEvent, false); // stop spinning
        }
      }

      setRolling(false);

      const total = finalDie1 + finalDie2;
      setStats((prev) => ({ ...prev, [total]: (prev[total] || 0) + 1 }));

      if (showEventDie && finalEvent !== null) {
        const eventType = eventDieFaces[finalEvent].type;
        setEventStats((prev) => ({ ...prev, [eventType]: prev[eventType] + 1 }));
      }
    }, settings.rollDuration);
  };


  const simulateRolls = () => {
    setSimulating(true);
    rollDice()
    const rolls = parseInt(testRolls) || 100;

    setTimeout(() => {
      const newStats = { ...stats };
      const newEventStats = { ...eventStats };

      for (let i = 0; i < rolls; i++) {
        const d1 = Math.floor(Math.random() * 6) + 1;
        const d2 = Math.floor(Math.random() * 6) + 1;
        const total = d1 + d2;
        newStats[total] = (newStats[total] || 0) + 1;

        if (showEventDie) {
          const event = Math.floor(Math.random() * 6);
          const eventType = eventDieFaces[event].type;
          newEventStats[eventType] = newEventStats[eventType] + 1;
        }
      }

      setStats(newStats);
      setEventStats(newEventStats);
      setSimulating(false);
    }, settings.rollDuration + 50);
  };

  const resetStats = () => {
    setStats({});
    setEventStats({ barbarian: 0, trade: 0, science: 0, politics: 0 });
  };

  const totalRolls = Object.values(stats).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            className="px-4 py-2 rounded-lg bg-white/90 shadow border border-slate-200 hover:bg-white font-semibold text-slate-700"
          >
            ⚙️ Settings
          </button>
          <h1 className="text-3xl font-bold text-slate-800">
            Catan Dice Roller
          </h1>
          {settingsOpen && (
            <div className="bg-white/90 backdrop-blur rounded-xl shadow-md border border-slate-200 p-6 mb-6 animate-in fade-in slide-in-from-top duration-200">

              <h2 className="text-xl font-bold text-slate-800 mb-4">Settings</h2>

              {/* Dice Colors */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">

                <div>
                  <label className="text-sm font-semibold text-slate-700">Die 1 Color</label>
                  <input
                    type="color"
                    value={settings.redDieColor}
                    onChange={(e) => setSettings({ ...settings, redDieColor: e.target.value })}
                    className="w-full h-10 rounded mt-2 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold text-slate-700">Die 2 Color</label>
                  <input
                    type="color"
                    value={settings.yellowDieColor}
                    onChange={(e) => setSettings({ ...settings, yellowDieColor: e.target.value })}
                    className="w-full h-10 rounded mt-2 cursor-pointer"
                  />
                </div>
              </div>

              {/* Theme Color */}
              <div className="mb-6">
                <label className="text-sm font-semibold text-slate-700">Theme Color</label>
                <input
                  type="color"
                  value={settings.themeColor}
                  onChange={(e) => setSettings({ ...settings, themeColor: e.target.value })}
                  className="w-full h-10 rounded mt-2 cursor-pointer"
                />
              </div>

              {/* Roll Duration */}
              <div>
                <label className="text-sm font-semibold text-slate-700">
                  Dice Roll Duration: {settings.rollDuration}ms
                </label>
                <input
                  type="range"
                  min="200"
                  max="3000"
                  step="100"
                  value={settings.rollDuration}
                  onChange={(e) => setSettings({ ...settings, rollDuration: Number(e.target.value) })}
                  className="w-full mt-2"
                />
              </div>

            </div>
          )}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 bg-white/90 px-4 py-2 rounded-lg shadow border border-slate-200 cursor-pointer hover:bg-white transition-colors">
              <input
                type="checkbox"
                checked={showEventDie}
                onChange={(e) => setShowEventDie(e.target.checked)}
                className="w-4 h-4 accent-indigo-600"
              />
              <span className="text-sm font-semibold text-slate-700">Cities & Knights</span>
            </label>
            <label className="flex items-center gap-2 bg-white/90 px-4 py-2 rounded-lg shadow border border-slate-200 cursor-pointer hover:bg-white transition-colors">
              <input
                type="checkbox"
                checked={showTestControls}
                onChange={(e) => setShowTestControls(e.target.checked)}
                className="w-4 h-4 accent-purple-600"
              />
              <span className="text-sm font-semibold text-slate-700">Test Mode</span>
            </label>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Dice Area */}
          <div className="lg:col-span-3 space-y-6">
            <div className="bg-white/90 backdrop-blur rounded-2xl shadow-xl p-8 border border-slate-200">
              <div className="flex justify-center items-center gap-8 mb-6 flex-wrap">
                {/* Red Die */}
                <div className="relative">
                  <canvas ref={canvasRef1} className="rounded-xl shadow-2xl" />
                </div>

                {/* Yellow Die */}
                <div className="relative">
                  <canvas ref={canvasRef2} className="rounded-xl shadow-2xl" />
                </div>

                {/* Event Die */}
                {showEventDie && (
                  <div className="relative flex flex-col items-center gap-2">
                    <canvas ref={canvasRefEvent} className="rounded-xl shadow-2xl" />
                    {/* removed the external label — value now shown on the die face itself */}
                  </div>
                )}
              </div>

              {/* Total */}
              { (
                <div className="flex justify-center mb-6">
                  <div className="text-6xl font-bold text-slate-700 bg-gradient-to-br from-slate-100 to-slate-200 w-32 h-32 rounded-2xl flex items-center justify-center shadow-lg border-2 border-slate-300">
                    {die1 !== null && die2 !== null && !rolling && (die1 + die2)}
                  </div>
                </div>
              )}

              {/* Roll Button */}
              <button
                onClick={rollDice}
                disabled={rolling}
                style={{
                  background: `linear-gradient(90deg, ${settings.themeColor}, ${settings.themeColor}CC)`
                }}
                className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-bold py-6 px-8 rounded-xl shadow-lg transform transition-all active:scale-95 disabled:opacity-50 text-2xl"
              >
                {rolling ? '🎲 Rolling...' : '🎲 Roll Dice'}
              </button>

              {/* Test Simulation */}
              {showTestControls && (
                <div className="flex gap-2 mt-4">
                  <input
                    type="number"
                    value={testRolls}
                    onChange={(e) => setTestRolls(e.target.value)}
                    placeholder="Number of rolls"
                    className="flex-1 px-4 py-3 rounded-lg border-2 border-slate-300 focus:border-indigo-500 focus:outline-none text-lg font-semibold"
                    min="1"
                    max="10000"
                  />
                  <button
                    onClick={simulateRolls}
                    disabled={simulating}
                    className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold rounded-lg shadow-lg transform transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                  >
                    <Play size={20} />
                    {simulating ? 'Simulating...' : 'Test'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Statistics Panel */}
          <div className="lg:col-span-3 space-y-6">
            {/* Number Statistics */}
            <div className="bg-white/90 backdrop-blur rounded-2xl shadow-xl p-6 border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <BarChart3 size={24} />
                  Statistics
                </h2>
                <button
                  onClick={resetStats}
                  className="text-xs bg-slate-200 hover:bg-slate-300 px-3 py-1 rounded-lg transition-colors font-medium"
                >
                  Reset
                </button>
              </div>

              <p className="text-sm text-slate-600 mb-4">Total Rolls: <span className="font-bold">{totalRolls}</span></p>

              <div className="space-y-2">
                {[2,3,4,5,6,7,8,9,10,11,12].map(num => {
                  const count = stats[num] || 0;
                  const percentage = totalRolls > 0 ? (count / totalRolls) * 100 : 0;
                  return (
                    <div key={num} className="flex items-center gap-2">
                      <div className="w-8 text-right font-bold text-slate-700">{num}</div>
                      <div className="flex-1 bg-slate-200 rounded-full h-6 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-indigo-500 to-blue-500 h-full flex items-center justify-end px-2 transition-all duration-300"
                          style={{ width: `${percentage}%`, background: settings.themeColor}}
                        >
                          {count > 0 && <span className="text-xs text-white font-semibold">{count}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Event Statistics */}
            {showEventDie && (
              <div className="bg-white/90 backdrop-blur rounded-2xl shadow-xl p-6 border border-slate-200">
                <h3 className="text-lg font-bold text-slate-800 mb-4">Event Stats</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900 shadow-md">
                      <Skull size={20} className="text-white" strokeWidth={2.5} />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-700">Barbarian</div>
                      <div className="text-2xl font-bold text-slate-800">{eventStats.barbarian}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-br from-amber-500 to-yellow-500 shadow-md">
                      <Ship size={20} className="text-white" strokeWidth={2.5} />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-700">Trade</div>
                      <div className="text-2xl font-bold text-slate-800">{eventStats.trade}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-br from-emerald-500 to-green-600 shadow-md">
                      <Sparkles size={20} className="text-white" strokeWidth={2.5} />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-700">Science</div>
                      <div className="text-2xl font-bold text-slate-800">{eventStats.science}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-br from-blue-500 to-blue-600 shadow-md">
                      <Users size={20} className="text-white" strokeWidth={2.5} />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-700">Politics</div>
                      <div className="text-2xl font-bold text-slate-800">{eventStats.politics}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}