import React, { useRef, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { sound } from '../utils/audioSynthesizer';

interface SpringNode {
  y: number;
  vy: number;
  baseY: number;
}

const NODE_COUNT = 64;
const SPRING_TENSION = 0.028;
const DAMPING = 0.93;
const SPREAD = 0.22;
const TICK_COUNT = 44;

interface HeroBipartiteHeaderProps {
  cashPositionStr: string;
  onHorizonPluck?: (ratio: number) => void;
}

export const HeroBipartiteHeader: React.FC<HeroBipartiteHeaderProps> = ({
  cashPositionStr,
  onHorizonPluck
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nodesRef = useRef<SpringNode[]>([]);
  const isDraggingRef = useRef(false);
  const sweepPosRef = useRef(0.2);
  const sweepDirRef = useRef(1);
  const animFrameRef = useRef<number | null>(null);

  const isScanning = true;

  // Initialize 64 nodes
  useEffect(() => {
    const nodes: SpringNode[] = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      nodes.push({ y: 0, vy: 0, baseY: 0 });
    }
    nodesRef.current = nodes;
  }, []);

  const triggerImpulse = useCallback(
    (xRatio: number, intensity: number = 35) => {
      const nodes = nodesRef.current;
      if (!nodes.length) return;

      const targetIdx = Math.max(0, Math.min(NODE_COUNT - 1, Math.floor(xRatio * NODE_COUNT)));
      const spread = 7;

      for (let offset = -spread; offset <= spread; offset++) {
        const idx = targetIdx + offset;
        if (idx >= 0 && idx < NODE_COUNT) {
          const falloff = 1 - Math.abs(offset) / (spread + 1);
          nodes[idx].vy += intensity * falloff;
        }
      }

      sound.playPluck(xRatio, Math.min(1, Math.abs(intensity) / 35));
      if (onHorizonPluck) onHorizonPluck(xRatio);
    },
    [onHorizonPluck]
  );

  // Physics animation loop
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

      // Keep the pale upper field and green wave equal at every container size.
      const midY = height * 0.5;
      nodesRef.current.forEach((n) => {
        n.baseY = midY;
        if (n.y === 0) n.y = midY;
      });
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    let tickCount = 0;

    const render = (time: number) => {
      tickCount++;
      const lightTheme = document.documentElement.dataset.theme === 'light';
      const upper = lightTheme ? '#FFFFFF' : '#F7FBF8';
      const lower = lightTheme ? '#84C6A2' : '#A8E0C4';
      const line = lightTheme ? 'rgba(18, 89, 65, 0.56)' : 'rgba(25, 97, 74, 0.48)';

      const nodes = nodesRef.current;
      const midY = height * 0.5;

      // 1. Hooke's Law spring oscillation
      for (let i = 0; i < NODE_COUNT; i++) {
        const node = nodes[i];
        if (!node) continue;
        const disp = node.y - node.baseY;
        const force = -SPRING_TENSION * disp;
        node.vy = (node.vy + force) * DAMPING;
        node.y += node.vy;
      }

      // 2. Multi-pass wave propagation to neighbors
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

      // 3. Pendulum radar sweep
      if (isScanning) {
        sweepPosRef.current += sweepDirRef.current * 0.0055;
        if (sweepPosRef.current >= 0.95) {
          sweepDirRef.current = -1;
          if (tickCount % 4 === 0) sound.playChirp(780);
        } else if (sweepPosRef.current <= 0.05) {
          sweepDirRef.current = 1;
          if (tickCount % 4 === 0) sound.playChirp(520);
        }

        const sweepIdx = Math.floor(sweepPosRef.current * NODE_COUNT);
        if (nodes[sweepIdx]) {
          nodes[sweepIdx].vy += Math.sin(time * 0.02) * 1.5;
        }
      }

      // CLEAR
      ctx.clearRect(0, 0, width, height);

      // A pale upper field keeps the original 50:50 liquidity composition.
      ctx.fillStyle = upper;
      ctx.fillRect(0, 0, width, height);

      // The moving lower half uses a theme-specific premium green.
      ctx.beginPath();
      ctx.moveTo(0, height);
      ctx.lineTo(0, nodes[0]?.y || midY);

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

      ctx.fillStyle = lower;
      ctx.fill();

      // Define the horizon against both pale surfaces.
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
      ctx.lineWidth = 2;
      ctx.strokeStyle = line;
      ctx.stroke();

      // Fine instrument ticks remain legible on both sides of the wave.
      const tickStep = width / (TICK_COUNT + 1);
      ctx.lineWidth = 1;
      for (let t = 1; t <= TICK_COUNT; t++) {
        const tx = t * tickStep;
        const tRatio = tx / width;
        const nodeIdx = Math.min(NODE_COUNT - 1, Math.floor(tRatio * NODE_COUNT));
        const hy = nodes[nodeIdx]?.y || midY;

        let amp = Math.abs(nodes[nodeIdx]?.vy || 0) * 2;
        if (isScanning) {
          const dist = Math.abs(tRatio - sweepPosRef.current);
          if (dist < 0.1) amp += (1 - dist / 0.1) * 20;
        }

        const tickH = 5 + Math.min(30, amp);
        ctx.beginPath();
        ctx.moveTo(tx, hy - tickH);
        ctx.lineTo(tx, hy + tickH);
        ctx.strokeStyle = t % 4 === 0 ? 'rgba(22, 91, 67, 0.54)' : 'rgba(30, 105, 78, 0.28)';
        ctx.stroke();
      }

      // A quiet green sweep marks the active point of the wave.
      if (isScanning) {
        const sx = sweepPosRef.current * width;
        const sIdx = Math.min(NODE_COUNT - 1, Math.floor(sweepPosRef.current * NODE_COUNT));
        const sy = nodes[sIdx]?.y || midY;

        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, height);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(21, 92, 67, 0.34)';
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        const pulse = (time * 0.06) % 28;
        ctx.beginPath();
        ctx.arc(sx, sy, 8 + pulse, 0, Math.PI * 2);
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = `rgba(21, 92, 67, ${Math.max(0, 0.65 - pulse / 36)})`;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(sx, sy, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#175F49';
        ctx.fill();
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isScanning]);

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const xRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const distY = e.clientY - rect.top - rect.height * 0.5;
    triggerImpulse(xRatio, distY * 0.85);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const xRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const distY = e.clientY - rect.top - rect.height * 0.5;
    triggerImpulse(xRatio, distY * 0.35);
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      className="relative h-[160px] w-full select-none cursor-pointer overflow-hidden sm:h-[190px]"
    >
      {/* Background bipartite pale and green canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      {/* Dark ink stays readable across both pale surfaces. */}
      <div className="liquidity-copy absolute inset-0 pointer-events-none flex flex-col justify-center items-center p-3 z-20">
        <div className="text-center my-auto">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="mb-1 font-mono text-[10px] font-medium uppercase tracking-[0.3em] opacity-75">
              LIQUIDITY
            </div>

            <h3 className="select-none font-sans text-[clamp(2.2rem,6vw,6rem)] font-black leading-none tracking-[-0.05em]">
              {cashPositionStr}
            </h3>
          </motion.div>
        </div>
      </div>

    </div>
  );
};
