/* Repository touch marker. */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { sound } from '../utils/audioSynthesizer';
import { Volume2, VolumeX, Activity, Radio, Sparkles } from 'lucide-react';

interface FluidHorizonProps {
  isScanning?: boolean;
  scanLabel?: string;
  onPluck?: (xRatio: number) => void;
  className?: string;
}

interface SpringNode {
  y: number;
  vy: number;
  baseY: number;
}

const NODE_COUNT = 48;
const SPRING_TENSION = 0.025;
const DAMPING = 0.94;
const SPREAD = 0.18;
const TICK_COUNT = 36;

export const FluidHorizon: React.FC<FluidHorizonProps> = ({
  isScanning = false,
  scanLabel = 'SPECTRUM SCAN // RECONCILING RAILS',
  onPluck,
  className = ''
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [internalScanning, setInternalScanning] = useState(isScanning);
  const [activeFrequencyHz, setActiveFrequencyHz] = useState<number>(440);
  const [lastPluckTime, setLastPluckTime] = useState<string>('IDLE');

  const nodesRef = useRef<SpringNode[]>([]);
  const isDraggingRef = useRef(false);
  const sweepPosRef = useRef(0.1);
  const sweepDirRef = useRef(1);
  const animFrameRef = useRef<number | null>(null);

  // Initialize 48-node physical spring array
  useEffect(() => {
    const nodes: SpringNode[] = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      nodes.push({ y: 0, vy: 0, baseY: 0 });
    }
    nodesRef.current = nodes;
  }, []);

  useEffect(() => {
    setInternalScanning(isScanning);
  }, [isScanning]);

  const triggerImpulse = useCallback((xRatio: number, intensity: number = 30) => {
    const nodes = nodesRef.current;
    if (!nodes.length) return;

    const targetIdx = Math.max(0, Math.min(NODE_COUNT - 1, Math.floor(xRatio * NODE_COUNT)));
    const spreadWidth = 5;

    for (let offset = -spreadWidth; offset <= spreadWidth; offset++) {
      const idx = targetIdx + offset;
      if (idx >= 0 && idx < NODE_COUNT) {
        const falloff = 1 - Math.abs(offset) / (spreadWidth + 1);
        nodes[idx].vy += intensity * falloff;
      }
    }

    sound.playPluck(xRatio, Math.min(1, Math.abs(intensity) / 35));
    if (onPluck) onPluck(xRatio);

    const calcFreq = Math.round(260 + xRatio * 620);
    setActiveFrequencyHz(calcFreq);
    setLastPluckTime(`${calcFreq} Hz // T=${new Date().toLocaleTimeString('en-IN', { hour12: false })}`);
  }, [onPluck]);

  // Main canvas animation and Hooke's Law physics loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;

    const handleResize = () => {
      dpr = window.devicePixelRatio || 1;
      width = container.clientWidth;
      height = container.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);

      // Re-center base horizon line at 50%
      const midY = height * 0.5;
      nodesRef.current.forEach(node => {
        node.baseY = midY;
        if (node.y === 0) node.y = midY;
      });
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    let lastTime = performance.now();
    let tickCounter = 0;

    const render = (time: number) => {
      const dt = Math.min(32, time - lastTime);
      lastTime = time;
      tickCounter++;

      const nodes = nodesRef.current;
      const midY = height * 0.5;

      // 1. Hooke's Law spring physics on nodes
      for (let i = 0; i < NODE_COUNT; i++) {
        const node = nodes[i];
        if (!node) continue;
        const displacement = node.y - node.baseY;
        const force = -SPRING_TENSION * displacement;
        node.vy = (node.vy + force) * DAMPING;
        node.y += node.vy;
      }

      // 2. Neighbor wave propagation (Left & Right multi-pass)
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < NODE_COUNT; i++) {
          if (i > 0) {
            const leftDelta = nodes[i - 1].y - nodes[i].y;
            nodes[i].vy += leftDelta * SPREAD;
          }
          if (i < NODE_COUNT - 1) {
            const rightDelta = nodes[i + 1].y - nodes[i].y;
            nodes[i].vy += rightDelta * SPREAD;
          }
        }
      }

      // 3. Radar / Pendulum Scanning Sweep Logic
      if (internalScanning) {
        sweepPosRef.current += sweepDirRef.current * 0.007;
        if (sweepPosRef.current >= 0.94) {
          sweepDirRef.current = -1;
          if (tickCounter % 3 === 0) sound.playChirp(720);
        } else if (sweepPosRef.current <= 0.06) {
          sweepDirRef.current = 1;
          if (tickCounter % 3 === 0) sound.playChirp(520);
        }

        // Deform fluid at sweep focal point
        const sweepIdx = Math.floor(sweepPosRef.current * NODE_COUNT);
        if (nodes[sweepIdx]) {
          nodes[sweepIdx].vy += Math.sin(time * 0.015) * 1.8;
        }
      }

      // CLEAR CANVAS
      ctx.clearRect(0, 0, width, height);

      // UPPER HEMISPHERE BACKGROUND (Pure Stark White #FFFFFF)
      // LOWER HEMISPHERE (Deep Void Carbon #090D14)
      // Draw fluid horizon polygon filling the bottom
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, height);
      ctx.lineTo(0, nodes[0]?.y || midY);

      // Catmull-Rom or cubic bezier smooth curve through spring nodes
      for (let i = 0; i < NODE_COUNT - 1; i++) {
        const curr = nodes[i];
        const next = nodes[i + 1];
        const cx = (i * (width / (NODE_COUNT - 1)) + (i + 1) * (width / (NODE_COUNT - 1))) * 0.5;
        const cy = (curr.y + next.y) * 0.5;
        const currX = i * (width / (NODE_COUNT - 1));
        ctx.quadraticCurveTo(currX, curr.y, cx, cy);
      }

      const lastNode = nodes[NODE_COUNT - 1];
      ctx.lineTo(width, lastNode?.y || midY);
      ctx.lineTo(width, height);
      ctx.closePath();

      // Lower void background fill
      ctx.fillStyle = '#090D14';
      ctx.fill();

      // 4. Hairline fluid boundary stroke (Optical razor line)
      ctx.beginPath();
      ctx.moveTo(0, nodes[0]?.y || midY);
      for (let i = 0; i < NODE_COUNT - 1; i++) {
        const curr = nodes[i];
        const next = nodes[i + 1];
        const cx = (i * (width / (NODE_COUNT - 1)) + (i + 1) * (width / (NODE_COUNT - 1))) * 0.5;
        const cy = (curr.y + next.y) * 0.5;
        const currX = i * (width / (NODE_COUNT - 1));
        ctx.quadraticCurveTo(currX, curr.y, cx, cy);
      }
      ctx.lineTo(width, lastNode?.y || midY);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#0047AB'; // Institutional reserve cobalt razor
      ctx.stroke();

      // 5. Oscilloscope Raster of 36 Vertical Hairline Ticks Straddling Horizon
      const tickStep = width / (TICK_COUNT + 1);
      ctx.lineWidth = 1;
      for (let t = 1; t <= TICK_COUNT; t++) {
        const tx = t * tickStep;
        const tRatio = tx / width;
        const nodeIdx = Math.min(NODE_COUNT - 1, Math.floor(tRatio * NODE_COUNT));
        const hy = nodes[nodeIdx]?.y || midY;

        // Amplitude swells near wave crests or near radar sweep position
        let ampFactor = Math.abs(nodes[nodeIdx]?.vy || 0) * 1.5;
        if (internalScanning) {
          const distToSweep = Math.abs(tRatio - sweepPosRef.current);
          if (distToSweep < 0.12) {
            ampFactor += (1 - distToSweep / 0.12) * 18;
          }
        }
        const tickHeight = 6 + Math.min(28, ampFactor);

        // Render tick straddling the seam
        ctx.beginPath();
        ctx.moveTo(tx, hy - tickHeight);
        ctx.lineTo(tx, hy + tickHeight);
        ctx.strokeStyle = t % 4 === 0 ? 'rgba(255, 255, 255, 0.7)' : 'rgba(148, 163, 184, 0.4)';
        ctx.stroke();
      }

      // 6. Scanning Radar Beam & Sonar Concentric Rings
      if (internalScanning) {
        const sweepX = sweepPosRef.current * width;
        const sweepIdx = Math.min(NODE_COUNT - 1, Math.floor(sweepPosRef.current * NODE_COUNT));
        const sweepY = nodes[sweepIdx]?.y || midY;

        // Vertical scanning laser hairline
        ctx.beginPath();
        ctx.moveTo(sweepX, 0);
        ctx.lineTo(sweepX, height);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(0, 71, 171, 0.45)';
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Concentric sonar ripple rings at intersection
        const pulse = (time * 0.05) % 24;
        ctx.beginPath();
        ctx.arc(sweepX, sweepY, 6 + pulse, 0, Math.PI * 2);
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(0, 71, 171, ${Math.max(0, 0.8 - pulse / 24)})`;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(sweepX, sweepY, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#0047AB';
        ctx.fill();
      }

      ctx.restore();
      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [internalScanning]);

  // Pointer event handlers for Plucking & Strumming the horizon
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const xRatio = Math.max(0, Math.min(1, x / rect.width));
    const y = e.clientY - rect.top;
    const midY = rect.height * 0.5;
    const distY = y - midY;

    triggerImpulse(xRatio, distY * 0.8);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const xRatio = Math.max(0, Math.min(1, x / rect.width));
    const y = e.clientY - rect.top;
    const midY = rect.height * 0.5;
    const distY = y - midY;

    // Dampened strum impulse while dragging
    triggerImpulse(xRatio, distY * 0.35);
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
  };

  const toggleAudio = () => {
    const nextMuted = !isAudioMuted;
    setIsAudioMuted(nextMuted);
    sound.setMuted(nextMuted);
  };

  const toggleScan = () => {
    setInternalScanning(!internalScanning);
    if (!internalScanning) {
      sound.playChirp(880);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden select-none cursor-crosshair ${className}`}
      style={{ height: '110px' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      title="Interactive Acoustic Fluid Horizon: Pluck, drag, or strum to vibrate ledger harmonics"
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      {/* Horizon Telemetry Readout & Controls Overlay */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center justify-between px-6 pointer-events-none z-10">
        {/* Left Telemetry: Harmonic Frequency & Status */}
        <div className="flex items-center gap-3 bg-black/80 backdrop-blur-md border border-slate-700/60 px-3 py-1 rounded text-[11px] font-mono tracking-wider text-slate-300 pointer-events-auto shadow-sm">
          <Activity className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
          <span>HORIZON HARMONICS: <span className="text-white font-semibold">{lastPluckTime}</span></span>
        </div>

        {/* Center Scanner Monospace Tag */}
        <div className="hidden md:flex items-center gap-2 bg-white/95 text-slate-900 border border-slate-300 px-3.5 py-0.5 rounded shadow-sm text-[11px] font-mono tracking-widest uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping" />
          <span>{scanLabel}</span>
        </div>

        {/* Right Controls: Sweep Radar & Audio Mute Toggles */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={toggleScan}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono transition-colors border ${
              internalScanning
                ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                : 'bg-black/80 text-slate-300 border-slate-700 hover:text-white'
            }`}
            title="Toggle Continuous Spectrum Radar Sweep"
          >
            <Radio className="w-3 h-3" />
            <span className="hidden sm:inline">{internalScanning ? 'SCANNING' : 'RADAR SWEEP'}</span>
          </button>

          <button
            onClick={() => triggerImpulse(0.5, 32)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono bg-black/80 text-slate-300 border border-slate-700 hover:text-white transition-colors"
            title="Strum Horizon Harmonic String"
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span className="hidden sm:inline">STRUM</span>
          </button>

          <button
            onClick={toggleAudio}
            className="p-1.5 rounded text-[11px] bg-black/80 text-slate-300 border border-slate-700 hover:text-white transition-colors"
            title={isAudioMuted ? 'Unmute ASMR Pluck Audio' : 'Mute ASMR Pluck Audio'}
            aria-label="Toggle ASMR Sound"
          >
            {isAudioMuted ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5 text-slate-200" />}
          </button>
        </div>
      </div>
    </div>
  );
};
