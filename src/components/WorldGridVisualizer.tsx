import React, { useState, useRef, useEffect } from 'react';
import { WorldBlock, BotConfig, EventLog } from '../types/index.js';
import { Compass, Info, User, ZoomIn, ZoomOut, RefreshCw, Move } from 'lucide-react';

interface WorldGridVisualizerProps {
  worldGrid: WorldBlock[];
  bots: BotConfig[];
  logs?: EventLog[];
}

interface EventMarker {
  id: string;
  x: number;
  z: number;
  type: 'place' | 'mine' | 'spawn' | 'other';
  message: string;
  botName?: string;
  timestamp: string;
  blockType?: string;
}

export const WorldGridVisualizer: React.FC<WorldGridVisualizerProps> = ({
  worldGrid,
  bots,
  logs = [],
}) => {
  const [hoveredBlock, setHoveredBlock] = useState<{ x: number; z: number; type: string } | null>(null);
  const [showEvents, setShowEvents] = useState<boolean>(true);

  // Zoom and Pan States
  const [scale, setScale] = useState<number>(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  // Smooth wheel zoom with scroll prevention
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = 1.15;
      setScale((prevScale) => {
        if (e.deltaY < 0) {
          return Math.min(prevScale * zoomFactor, 4);
        } else {
          return Math.max(prevScale / zoomFactor, 0.5);
        }
      });
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', onWheel);
    };
  }, []);

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev * 1.2, 4));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev / 1.2, 0.5));
  };

  const handleReset = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Left click only
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Parse logs to extract coordinates and generate event markers
  const parsedMarkers: EventMarker[] = React.useMemo(() => {
    const markers: EventMarker[] = [];
    logs.forEach((log) => {
      let x: number | null = null;
      let z: number | null = null;
      let blockType: string | undefined = undefined;
      let type: 'place' | 'mine' | 'spawn' | 'other' = 'other';

      // 1. Detect block placement: "placed [stone] at [x: 5, y: 64, z: -3]"
      const placeMatch = log.message.match(/placed\s+\[([^\]]+)\]\s+at\s+\[x:\s*(-?\d+),\s*y:\s*(-?\d+),\s*z:\s*(-?\d+)\]/i);
      if (placeMatch) {
        blockType = placeMatch[1];
        x = parseInt(placeMatch[2], 10);
        z = parseInt(placeMatch[4], 10);
        type = 'place';
      } else {
        // 2. Detect block mining/harvesting: "mined and harvested [oak_log] block at coordinates [x: -2, y: 64, z: 4]"
        const mineMatch = log.message.match(/mined\s+and\s+harvested\s+\[([^\]]+)\]\s+block\s+at\s+coordinates\s+\[x:\s*(-?\d+),\s*y:\s*(-?\d+),\s*z:\s*(-?\d+)\]/i);
        if (mineMatch) {
          blockType = mineMatch[1];
          x = parseInt(mineMatch[2], 10);
          z = parseInt(mineMatch[4], 10);
          type = 'mine';
        } else {
          // 3. Detect general coordinates like walking
          const coordsMatch = log.message.match(/\[x:\s*(-?\d+),\s*y:\s*(-?\d+),\s*z:\s*(-?\d+)\]/i);
          if (coordsMatch) {
            x = parseInt(coordsMatch[1], 10);
            z = parseInt(coordsMatch[3], 10);
            if (log.message.toLowerCase().includes('walked')) {
              type = 'other';
            }
          }
        }
      }

      // 4. Detect bot spawns
      if (log.message.includes('Attaching bot client') || log.message.includes('established connection') || log.message.includes('successfully established connection')) {
        const matchedBot = bots.find(b => b.name === log.botName || (log.botId && b.id === log.botId));
        if (matchedBot) {
          x = matchedBot.x;
          z = matchedBot.z;
          type = 'spawn';
        }
      }

      if (x !== null && z !== null && !isNaN(x) && !isNaN(z)) {
        markers.push({
          id: log.id,
          x,
          z,
          type,
          message: log.message,
          botName: log.botName,
          timestamp: log.timestamp,
          blockType,
        });
      }
    });
    return markers;
  }, [logs, bots]);

  // Define grid layout limits
  // Map coordinates run from -15 to 14
  const minCoord = -15;
  const maxCoord = 14;
  const gridSize = 30;

  // Render color styles for block types
  const getBlockColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'water': return 'bg-sky-650 border border-sky-800/30';
      case 'stone': return 'bg-slate-600 border border-slate-700/30';
      case 'oak_log': return 'bg-amber-800 border border-amber-950/20';
      case 'crafting_table': return 'bg-brand-green border border-brand-green/40 ring-1 ring-brand-green/30';
      case 'grass_block': return 'bg-emerald-800 border border-emerald-900/20';
      case 'air': return 'bg-brand-bg border border-brand-border/10';
      default: return 'bg-emerald-700 border border-emerald-800/20';
    }
  };

  // Build matrix for grid render
  const matrix: (WorldBlock | null)[][] = Array(gridSize).fill(null).map(() => Array(gridSize).fill(null));

  worldGrid.forEach((block) => {
    // Translate coords (-15 to 14) to indexes (0 to 29)
    const row = block.z - minCoord;
    const col = block.x - minCoord;

    if (row >= 0 && row < gridSize && col >= 0 && col < gridSize) {
      matrix[row][col] = block;
    }
  });

  return (
    <div id="world-grid-visualizer" className="bg-brand-aside border border-brand-border rounded-none p-4 shadow-none flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-brand-border pb-3 mb-4">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-brand-green" />
          <h2 className="text-[10px] font-mono uppercase tracking-widest text-brand-muted font-bold">Spatial Vector Map // LOCATIONS</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[9px] font-mono text-brand-muted hidden sm:flex items-center gap-1 bg-brand-bg border border-brand-border px-2 py-0.5 rounded-none uppercase">
            <Move className="w-3 h-3 text-brand-green" />
            <span>Drag to Pan / Scroll to Zoom</span>
          </div>
          <button
            onClick={() => setShowEvents(!showEvents)}
            className={`text-[9px] font-mono flex items-center gap-1.5 border px-2 py-0.5 rounded-none uppercase font-bold transition-all cursor-pointer ${
              showEvents
                ? 'bg-brand-green/10 text-brand-green border-brand-green/40 hover:bg-brand-green/20'
                : 'bg-brand-bg text-brand-muted border-brand-border hover:text-brand-text hover:border-brand-border-light'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${showEvents ? 'bg-brand-green animate-pulse' : 'bg-brand-muted'}`}></span>
            <span>Events Overlay: {showEvents ? 'ON' : 'OFF'}</span>
          </button>
          <div className="text-[9px] font-mono text-brand-muted flex items-center gap-1 bg-brand-bg border border-brand-border px-2 py-0.5 rounded-none uppercase">
            <span>Dimensions: 30x30 coordinates</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 flex-grow">
        {/* Left Column: Visual Map Matrix */}
        <div 
          ref={containerRef}
          className={`xl:col-span-3 relative flex justify-center items-center bg-brand-bg rounded-none border border-brand-border p-4 overflow-hidden select-none cursor-grab ${isDragging ? 'cursor-grabbing' : ''}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Zoom/Pan Controls Overlay */}
          <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5 bg-brand-panel border border-brand-border p-1.5 shadow-sm">
            <button
              onClick={handleZoomIn}
              title="Zoom In"
              className="p-1 text-brand-muted hover:text-brand-green bg-brand-bg border border-brand-border/40 hover:border-brand-green/40 transition-all cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleZoomOut}
              title="Zoom Out"
              className="p-1 text-brand-muted hover:text-brand-green bg-brand-bg border border-brand-border/40 hover:border-brand-green/40 transition-all cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleReset}
              title="Reset View"
              className="p-1 text-brand-muted hover:text-brand-green bg-brand-bg border border-brand-border/40 hover:border-brand-green/40 transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <div className="h-4 w-[1px] bg-brand-border/60 mx-1" />
            <span className="text-[9px] font-mono font-bold text-brand-green px-1 select-none">
              {Math.round(scale * 100)}%
            </span>
          </div>

          <div 
            className="transition-transform duration-75 ease-out origin-center"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            }}
          >
            {/* The grid of blocks */}
            <div className="grid grid-cols-30 gap-[1px] bg-brand-border p-0.5 border border-brand-border/80 rounded-none select-none">
              {matrix.map((rowArr, zIdx) => (
                <div key={zIdx} className="contents">
                  {rowArr.map((block, xIdx) => {
                    const actualX = xIdx + minCoord;
                    const actualZ = zIdx + minCoord;

                    // Check if a bot stands here
                    const standingBots = bots.filter(
                      (b) => b.x === actualX && b.z === actualZ
                    );

                    const cellEvents = showEvents
                      ? parsedMarkers.filter(m => m.x === actualX && m.z === actualZ)
                      : [];

                    return (
                      <div
                        key={xIdx}
                        className={`w-3 h-3 sm:w-4 sm:h-4 rounded-none relative cursor-crosshair transition-all hover:scale-125 hover:z-20 ${
                          block ? getBlockColor(block.type) : 'bg-brand-bg'
                        }`}
                        onMouseEnter={() =>
                          setHoveredBlock({
                            x: actualX,
                            z: actualZ,
                            type: block ? block.type : 'air',
                          })
                        }
                        onMouseLeave={() => setHoveredBlock(null)}
                      >
                        {/* Render bot pin if stands on this coordinate */}
                        {standingBots.length > 0 && (
                          <div className="absolute inset-0 bg-brand-green rounded-none flex items-center justify-center border border-brand-bg text-[8px] font-mono font-bold text-brand-bg shadow-none animate-pulse z-10">
                            {standingBots[0].name[0].toUpperCase()}
                          </div>
                        )}

                        {/* Render event markers */}
                        {cellEvents.length > 0 && standingBots.length === 0 && (() => {
                          const latestEvent = cellEvents[cellEvents.length - 1];
                          let markerColor = 'bg-brand-green';
                          let markerSymbol = 'P';
                          if (latestEvent.type === 'mine') {
                            markerColor = 'bg-amber-500';
                            markerSymbol = 'M';
                          } else if (latestEvent.type === 'spawn') {
                            markerColor = 'bg-purple-500';
                            markerSymbol = 'S';
                          } else if (latestEvent.type === 'other') {
                            markerColor = 'bg-blue-400';
                            markerSymbol = '•';
                          }

                          return (
                            <div 
                              className={`absolute inset-0.5 rounded-none flex items-center justify-center text-[7px] font-mono font-bold text-brand-bg ${markerColor} opacity-90 animate-pulse z-10 shadow-sm border border-brand-bg/30`}
                              title={`[${latestEvent.type.toUpperCase()}] ${latestEvent.botName || 'System'}: ${latestEvent.message}`}
                            >
                              {markerSymbol}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Key Legends & Selected Inspector */}
        <div className="xl:col-span-1 space-y-4 flex flex-col justify-between">
          <div className="bg-brand-bg border border-brand-border rounded-none p-3.5">
            <h3 className="text-[10px] font-mono font-bold text-brand-green uppercase tracking-widest mb-3 block">// MAP & EVENTS SYMBOLOGY</h3>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono uppercase border-b border-brand-border/40 pb-3 mb-3">
              <div className="flex items-center gap-1.5 text-brand-text">
                <span className="w-3 h-3 rounded-none bg-emerald-800 border border-emerald-900/20" />
                <span>Grass</span>
              </div>
              <div className="flex items-center gap-1.5 text-brand-text">
                <span className="w-3 h-3 rounded-none bg-sky-650 border border-sky-800/20" />
                <span>Water</span>
              </div>
              <div className="flex items-center gap-1.5 text-brand-text">
                <span className="w-3 h-3 rounded-none bg-slate-600 border border-slate-700/20" />
                <span>Stone</span>
              </div>
              <div className="flex items-center gap-1.5 text-brand-text">
                <span className="w-3 h-3 rounded-none bg-amber-800 border border-amber-950/20" />
                <span>Oak Log</span>
              </div>
              <div className="flex items-center gap-1.5 text-brand-text text-[9px]">
                <span className="w-3 h-3 rounded-none bg-brand-green border border-brand-green/40" />
                <span>Crafting</span>
              </div>
            </div>

            {showEvents && (
              <div className="space-y-1.5 text-[10px] font-mono uppercase">
                <span className="text-[8px] text-brand-muted block font-bold mb-1">// EVENT MARKERS</span>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-1.5 text-brand-text">
                    <span className="w-3.5 h-3.5 bg-brand-green text-brand-bg flex items-center justify-center text-[8px] font-bold">P</span>
                    <span>Placed</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-brand-text">
                    <span className="w-3.5 h-3.5 bg-amber-500 text-brand-bg flex items-center justify-center text-[8px] font-bold">M</span>
                    <span>Mined</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-brand-text">
                    <span className="w-3.5 h-3.5 bg-purple-500 text-brand-bg flex items-center justify-center text-[8px] font-bold">S</span>
                    <span>Spawned</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-brand-text">
                    <span className="w-3.5 h-3.5 bg-blue-400 text-brand-bg flex items-center justify-center text-[8px] font-bold">•</span>
                    <span>Activity</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Active Bot position stats */}
          <div className="bg-brand-bg border border-brand-border rounded-none p-3.5">
            <h3 className="text-[10px] font-mono font-bold text-brand-green uppercase tracking-widest mb-2.5 block">// ENTITY GPS COORDS</h3>
            {bots.length > 0 ? (
              <div className="space-y-2 font-mono">
                {bots.map((b) => (
                  <div key={b.id} className="flex items-center justify-between text-xs border-b border-brand-border/40 pb-1.5 last:border-b-0 last:pb-0">
                    <div className="flex items-center gap-1.5 text-brand-text">
                      <User className="w-3.5 h-3.5 text-brand-green" />
                      <span>{b.name}</span>
                    </div>
                    <span className="font-mono text-brand-green font-bold">
                      X:{b.x} | Z:{b.z}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[10px] font-mono text-brand-muted uppercase italic">No active entities located.</div>
            )}
          </div>

          {/* Hover block details inspector */}
          <div className="bg-brand-bg border border-brand-border rounded-none p-3.5 flex-grow min-h-[120px] flex flex-col justify-center">
            {hoveredBlock ? (() => {
              const hoverEvents = parsedMarkers.filter(m => m.x === hoveredBlock.x && m.z === hoveredBlock.z);
              return (
                <div className="space-y-1.5 font-mono uppercase text-[9px]">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-brand-green">
                    <Info className="w-3.5 h-3.5" />
                    <span>BLOCK INSPECTOR</span>
                  </div>
                  <div className="text-xs text-brand-text font-bold">TYPE: <span className="text-brand-green">{hoveredBlock.type}</span></div>
                  <div className="text-[10px] text-brand-muted">VECTORS: [X: {hoveredBlock.x}, Z: {hoveredBlock.z}]</div>
                  {hoverEvents.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-brand-border/40">
                      <span className="text-[8px] text-brand-green block font-bold mb-1">// EVENTS RECORDED ({hoverEvents.length}):</span>
                      <div className="max-h-[65px] overflow-y-auto space-y-1 scrollbar-thin">
                        {hoverEvents.map((ev, idx) => (
                          <div key={idx} className="text-[8px] text-brand-text leading-tight border-b border-brand-border/20 pb-1 last:border-b-0">
                            <span className="text-brand-muted font-bold">[{ev.type}]</span> {ev.message}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })() : (
              <div className="text-center text-[10px] text-brand-muted italic font-mono uppercase tracking-tight">
                Hover cells to parse coordinates
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
