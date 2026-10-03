/* Repository touch marker. */
'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';

// ============================================================
// SAFETY TOGGLE: Set to false to instantly turn off everything
// ============================================================
const ENABLE_FLOATING_MONEY = true;

// ============================================================
// CENTRAL TUNING CONFIGURATION
// ============================================================
const CONFIG = {
  chip: {
    spawnEveryMs: [150, 320],              // roughly 4 chips per second
    popInSec: 0.2,
    floatSec: [2.0, 3.4],
    fadeOutSec: 0.28,
    driftPx: [36, 80],
    maxVisible: { desktop: 20, tablet: 12, phone: 6 },
    minLive:    { desktop: 9,  tablet: 6,  phone: 3 },   // watchdog target
    visibleFloor: { desktop: 6, tablet: 4, phone: 2 },   // guaranteed minimum on screen
  },
  symbol: {
    spawnEveryMs: [500, 900],              // a new symbol every 0.5-0.9 s
    popInSec: 0.3,
    floatSec: [2.5, 4.0],
    fadeOutSec: 0.4,
    driftPx: [30, 60],
    maxVisible: { desktop: 10, tablet: 6, phone: 3 },
  },
  initialBurst: { count: 10, staggerMs: 90 }, // on load, 10 chips pop within ~1 s
  overlapPaddingPx: 4,
  placementAttempts: 18,
};

// ============================================================
// ACCENT COLORS: Muted green for credit, muted red for debit
// ============================================================
const ACCENT_COLORS = {
  credit: '#16a34a',
  debit: '#dc2626',
};

interface TransactionItem {
  id: number;
  type: 'credit' | 'debit';
  tag: string;
  amount: number;
  currency: string;
  locale: string;
}

// 24 sample entries (12 credit, 12 debit)
const SAMPLE_TRANSACTIONS: TransactionItem[] = [
  // Credited (12)
  { id: 1, type: 'credit', tag: 'Salary', amount: 75000, currency: 'INR', locale: 'en-IN' },
  { id: 2, type: 'credit', tag: 'Refund', amount: 180, currency: 'USD', locale: 'en-US' },
  { id: 3, type: 'credit', tag: 'Cashback', amount: 2500, currency: 'INR', locale: 'en-IN' },
  { id: 4, type: 'credit', tag: 'Interest', amount: 450, currency: 'EUR', locale: 'de-DE' },
  { id: 5, type: 'credit', tag: 'Dividend', amount: 1200, currency: 'GBP', locale: 'en-GB' },
  { id: 6, type: 'credit', tag: 'Bonus', amount: 35000, currency: 'JPY', locale: 'ja-JP' },
  { id: 7, type: 'credit', tag: 'Freelance', amount: 1450, currency: 'USD', locale: 'en-US' },
  { id: 8, type: 'credit', tag: 'Reimbursement', amount: 8200, currency: 'INR', locale: 'en-IN' },
  { id: 9, type: 'credit', tag: 'Consulting', amount: 850, currency: 'GBP', locale: 'en-GB' },
  { id: 10, type: 'credit', tag: 'Royalty', amount: 620, currency: 'EUR', locale: 'fr-FR' },
  { id: 11, type: 'credit', tag: 'Staking', amount: 340, currency: 'USD', locale: 'en-US' },
  { id: 12, type: 'credit', tag: 'Grant', amount: 50000, currency: 'INR', locale: 'en-IN' },

  // Debited (12)
  { id: 13, type: 'debit', tag: 'Rent', amount: 32000, currency: 'INR', locale: 'en-IN' },
  { id: 14, type: 'debit', tag: 'Groceries', amount: 85, currency: 'USD', locale: 'en-US' },
  { id: 15, type: 'debit', tag: 'Subscription', amount: 15, currency: 'EUR', locale: 'de-DE' },
  { id: 16, type: 'debit', tag: 'Fuel', amount: 3800, currency: 'INR', locale: 'en-IN' },
  { id: 17, type: 'debit', tag: 'Electricity', amount: 4200, currency: 'INR', locale: 'en-IN' },
  { id: 18, type: 'debit', tag: 'Dining', amount: 120, currency: 'GBP', locale: 'en-GB' },
  { id: 19, type: 'debit', tag: 'Travel', amount: 560, currency: 'USD', locale: 'en-US' },
  { id: 20, type: 'debit', tag: 'Flight', amount: 42000, currency: 'JPY', locale: 'ja-JP' },
  { id: 21, type: 'debit', tag: 'EMI', amount: 18500, currency: 'INR', locale: 'en-IN' },
  { id: 22, type: 'debit', tag: 'Insurance', amount: 210, currency: 'GBP', locale: 'en-GB' },
  { id: 23, type: 'debit', tag: 'Shopping', amount: 195, currency: 'USD', locale: 'en-US' },
  { id: 24, type: 'debit', tag: 'Cloud', amount: 45, currency: 'EUR', locale: 'de-DE' },
];

const CURRENCY_SYMBOLS = ['₹', '$', '€', '£', '¥', '₿'];

function formatAmount(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

interface ActiveItem {
  id: string;
  type: 'chip' | 'symbol';
  x: number;
  y: number;
  width: number;
  height: number;
  driftY: number;
  scale: number;
  isFadingOut: boolean;
  el: HTMLElement;
  tl: gsap.core.Timeline;
}

interface GridCell {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  region: 'left' | 'right' | 'top';
  lastUsed: number;
}

export default function FloatingMoney() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ENABLE_FLOATING_MONEY || !containerRef.current) return;

    const container = containerRef.current;
    const activeItems: ActiveItem[] = [];
    const recentTxIds: number[] = [];
    const chipPool: HTMLElement[] = [];
    let nextTypeToggle: 'credit' | 'debit' = 'credit';
    let isPaused = false;
    let chipTimeout: NodeJS.Timeout | null = null;
    let symbolTimeout: NodeJS.Timeout | null = null;
    let watchdogInterval: NodeJS.Timeout | null = null;
    let resizeTimeout: NodeJS.Timeout | null = null;
    let topupTimeout: NodeJS.Timeout | null = null;
    const burstTimeouts: NodeJS.Timeout[] = [];

    let gridCells: GridCell[] = [];

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // DOM Element Pool helper
    function getChipElement(isMobile: boolean): HTMLElement {
      const el = chipPool.pop() || document.createElement('div');
      el.className = isMobile
        ? 'absolute flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/90 backdrop-blur-sm border border-black/10 shadow-[0_6px_20px_rgba(0,0,0,0.08)] text-[12px] font-medium tabular-nums whitespace-nowrap text-black pointer-events-none select-none'
        : 'absolute flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/90 backdrop-blur-sm border border-black/10 shadow-[0_6px_20px_rgba(0,0,0,0.08)] text-[13px] font-medium tabular-nums whitespace-nowrap text-black pointer-events-none select-none';
      return el;
    }

    function releaseChipElement(el: HTMLElement) {
      el.remove();
      gsap.set(el, { clearProps: 'all' });
      if (chipPool.length < 32) {
        chipPool.push(el);
      }
    }

    const ctx = gsap.context(() => {
      function getLimits() {
        const w = window.innerWidth;
        if (w >= 1024) {
          return {
            maxChips: CONFIG.chip.maxVisible.desktop,
            minLive: CONFIG.chip.minLive.desktop,
            maxSymbols: CONFIG.symbol.maxVisible.desktop,
            isMobile: false,
          };
        }
        if (w >= 700) {
          return {
            maxChips: CONFIG.chip.maxVisible.tablet,
            minLive: CONFIG.chip.minLive.tablet,
            maxSymbols: CONFIG.symbol.maxVisible.tablet,
            isMobile: false,
          };
        }
        return {
          maxChips: CONFIG.chip.maxVisible.phone,
          minLive: CONFIG.chip.minLive.phone,
          maxSymbols: CONFIG.symbol.maxVisible.phone,
          isMobile: true,
        };
      }

      function getCardRectAndCrowd() {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const crowdTop = vh * 0.42;

        const cardWrapper = document.querySelector('[data-login-card]');
        const cardInner = cardWrapper?.querySelector('.rounded-3xl') || cardWrapper;
        const rawRect = cardInner ? cardInner.getBoundingClientRect() : {
          left: vw / 2 - 210,
          right: vw / 2 + 210,
          top: vh / 2 - 250,
          bottom: vh / 2 + 250,
        };

        const cardRect = {
          left: rawRect.left - 32,
          right: rawRect.right + 32,
          top: rawRect.top - 32,
          bottom: rawRect.bottom + 32,
        };

        return { cardRect, crowdTop, vw, vh, isMobile: vw < 700 };
      }

      // ----------------------------------------------------
      // Grid construction (140px x 70px cells) with regional tagging
      // ----------------------------------------------------
      function updateGrid() {
        const { cardRect, crowdTop, vw, isMobile } = getCardRectAndCrowd();
        const cellW = isMobile ? 160 : 140;
        const cellH = isMobile ? 42 : 70;
        const prevMap = new Map(gridCells.map((c) => [`${Math.round(c.x / 30)}_${Math.round(c.y / 30)}`, c.lastUsed]));

        const newCells: GridCell[] = [];
        const startX = isMobile ? 16 : 24;
        const endX = vw - (isMobile ? 16 : 24);
        const startY = isMobile ? 16 : 24;
        const endY = crowdTop;

        for (let x = startX; x + cellW <= endX; x += cellW) {
          for (let y = startY; y + cellH <= endY; y += cellH) {
            const intersectsCard = !(
              x + cellW < cardRect.left ||
              x > cardRect.right ||
              y + cellH < cardRect.top ||
              y > cardRect.bottom
            );
            if (intersectsCard) continue;

            if (isMobile && y + cellH > cardRect.top) continue;

            let region: 'left' | 'right' | 'top' = 'top';
            if (x + cellW <= cardRect.left) region = 'left';
            else if (x >= cardRect.right) region = 'right';

            const key = `${Math.round(x / 30)}_${Math.round(y / 30)}`;
            const existingTime = prevMap.get(key) || 0;

            newCells.push({
              id: `c_${x}_${y}`,
              x,
              y,
              w: cellW,
              h: cellH,
              region,
              lastUsed: existingTime,
            });
          }
        }

        gridCells = newCells;
      }

      updateGrid();

      // ----------------------------------------------------
      // Overlap detection with configurable padding
      // ----------------------------------------------------
      function doesOverlap(
        x: number,
        y: number,
        w: number,
        h: number,
        driftY: number,
        cardRect: { left: number; right: number; top: number; bottom: number },
        padding: number,
        itemType: 'chip' | 'symbol'
      ): boolean {
        const itemBox = {
          left: x - 6,
          right: x + w + 6,
          top: y - driftY,
          bottom: y + h,
        };

        // Strictly verify card bounds
        const overlapsCard = !(
          itemBox.right < cardRect.left ||
          itemBox.left > cardRect.right ||
          itemBox.bottom < cardRect.top ||
          itemBox.top > cardRect.bottom
        );
        if (overlapsCard) return true;

        // Check active items of the same type (fading items are ignored as they leave before arrival)
        for (const active of activeItems) {
          if (itemType === 'chip') {
            if (active.type !== 'chip' || active.isFadingOut) continue;
          } else {
            if (active.type !== 'symbol' || active.isFadingOut) continue;
          }

          const activeBox = {
            left: active.x - 6,
            right: active.x + active.width + 6,
            top: active.y - active.driftY,
            bottom: active.y + active.height,
          };
          const overlapsActive = !(
            itemBox.right + padding < activeBox.left ||
            itemBox.left - padding > activeBox.right ||
            itemBox.bottom + padding < activeBox.top ||
            itemBox.top - padding > activeBox.bottom
          );
          if (overlapsActive) return true;
        }

        return false;
      }

      // ----------------------------------------------------
      // Balanced Placement Strategy: Empty-First + Regional Balancing + Multi-pass Fallback
      // ----------------------------------------------------
      function findPosition(
        itemW: number,
        itemH: number,
        driftY: number,
        cardRect: { left: number; right: number; top: number; bottom: number },
        crowdTop: number,
        vw: number,
        passPadding: number,
        itemType: 'chip' | 'symbol' = 'chip'
      ): { x: number; y: number } | null {
        if (gridCells.length === 0) return null;

        // 1. Regional balance: count active chips per region
        const leftCount = activeItems.filter((i) => i.type === 'chip' && !i.isFadingOut && i.x < cardRect.left).length;
        const rightCount = activeItems.filter((i) => i.type === 'chip' && !i.isFadingOut && i.x > cardRect.right).length;
        const topCount = activeItems.filter((i) => i.type === 'chip' && !i.isFadingOut && i.y < cardRect.top).length;

        // Determine priority region if any region has < 2 chips
        let priorityRegion: 'left' | 'right' | 'top' | null = null;
        if (vw >= 700 && itemType === 'chip') {
          if (leftCount < 2 && gridCells.some((c) => c.region === 'left')) priorityRegion = 'left';
          else if (rightCount < 2 && gridCells.some((c) => c.region === 'right')) priorityRegion = 'right';
          else if (topCount < 2 && gridCells.some((c) => c.region === 'top')) priorityRegion = 'top';
        }

        // 2. Sort candidate cells:
        // Priority region first, then currently empty cells, then least recently used
        const sorted = [...gridCells].sort((a, b) => {
          if (priorityRegion) {
            if (a.region === priorityRegion && b.region !== priorityRegion) return -1;
            if (a.region !== priorityRegion && b.region === priorityRegion) return 1;
          }

          // Check if cell is currently free of active items of this type
          const aActive = activeItems.some((item) => item.type === itemType && !item.isFadingOut && !(item.x + item.width < a.x || item.x > a.x + a.w || item.y + item.height < a.y || item.y > a.y + a.h));
          const bActive = activeItems.some((item) => item.type === itemType && !item.isFadingOut && !(item.x + item.width < b.x || item.x > b.x + b.w || item.y + item.height < b.y || item.y > b.y + b.h));

          if (!aActive && bActive) return -1;
          if (aActive && !bActive) return 1;

          return a.lastUsed - b.lastUsed;
        });

        const maxCandidates = Math.min(CONFIG.placementAttempts, sorted.length);
        const candidates = sorted.slice(0, maxCandidates);

        for (let i = 0; i < candidates.length; i++) {
          const pool = Math.min(3, candidates.length - i);
          const pickIndex = i + Math.floor(Math.random() * pool);
          const cell = candidates[pickIndex];
          candidates[pickIndex] = candidates[i];
          candidates[i] = cell;

          const pad = vw < 700 ? 16 : 24;
          const baseMinX = Math.max(pad, Math.min(vw - pad - itemW, cell.x - 20));
          const baseMaxX = Math.max(pad, Math.min(vw - pad - itemW, cell.x + 20));
          const testX = Math.floor(gsap.utils.random(baseMinX, Math.max(baseMinX, baseMaxX)));

          const baseMinY = Math.max(pad + driftY, Math.min(crowdTop - itemH, cell.y));
          const baseMaxY = Math.max(pad + driftY, Math.min(crowdTop - itemH, cell.y + Math.max(0, cell.h - itemH)));
          const testY = Math.floor(gsap.utils.random(baseMinY, Math.max(baseMinY, baseMaxY)));

          if (!doesOverlap(testX, testY, itemW, itemH, driftY, cardRect, passPadding, itemType)) {
            cell.lastUsed = Date.now();
            return { x: testX, y: testY };
          }
        }

        return null;
      }

      function removeItem(item: ActiveItem) {
        const idx = activeItems.indexOf(item);
        if (idx !== -1) {
          activeItems.splice(idx, 1);
        }
        item.tl.kill();
        if (item.type === 'chip') {
          releaseChipElement(item.el);
        } else {
          item.el.remove();
        }
      }

      // ----------------------------------------------------
      // Spawn: Transaction Chip with Multi-pass Fallback
      // ----------------------------------------------------
      function spawnChip(isTopup = false): boolean {
        if (isPaused) return false;

        const { maxChips, isMobile } = getLimits();
        const currentChips = activeItems.filter((i) => i.type === 'chip').length;
        if (currentChips >= maxChips) {
          if (!isTopup) scheduleNextChip();
          return false;
        }

        const driftY = isMobile
          ? Math.floor(gsap.utils.random(20, 36))
          : Math.floor(gsap.utils.random(CONFIG.chip.driftPx[0], CONFIG.chip.driftPx[1]));
        let estimatedW = isMobile ? 180 : 210;
        let estimatedH = isMobile ? 34 : 38;
        let appliedScale = 1.0;

        const { cardRect, crowdTop, vw } = getCardRectAndCrowd();

        // Pass 1: standard overlapPaddingPx (4px)
        let pos = findPosition(estimatedW, estimatedH, driftY, cardRect, crowdTop, vw, CONFIG.overlapPaddingPx);

        // Pass 2: fallback with 0px overlap padding if crowded
        if (!pos) {
          pos = findPosition(estimatedW, estimatedH, driftY, cardRect, crowdTop, vw, 0);
        }

        // Pass 3: fallback with scale 0.9 if still crowded
        if (!pos) {
          appliedScale = 0.9;
          estimatedW = Math.floor(estimatedW * 0.9);
          estimatedH = Math.floor(estimatedH * 0.9);
          pos = findPosition(estimatedW, estimatedH, driftY, cardRect, crowdTop, vw, 0);
        }

        if (!pos) {
          if (!isTopup) scheduleNextChip();
          return false;
        }

        // Pick transaction: 50/50 balance, no repeat within last 10
        const targetType = nextTypeToggle;
        nextTypeToggle = nextTypeToggle === 'credit' ? 'debit' : 'credit';

        let available = SAMPLE_TRANSACTIONS.filter((t) => t.type === targetType && !recentTxIds.includes(t.id));
        if (available.length === 0) {
          available = SAMPLE_TRANSACTIONS.filter((t) => t.type === targetType);
        }
        const tx = available[Math.floor(Math.random() * available.length)];

        recentTxIds.push(tx.id);
        if (recentTxIds.length > 10) {
          recentTxIds.shift();
        }

        const isCredit = tx.type === 'credit';
        const accentColor = isCredit ? ACCENT_COLORS.credit : ACCENT_COLORS.debit;
        const formatted = formatAmount(tx.amount, tx.currency, tx.locale);

        const iconSvg = isCredit
          ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="7" x2="7" y2="17"></line><polyline points="17 17 7 17 7 7"></polyline></svg>`
          : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>`;

        const el = getChipElement(isMobile);
        el.style.left = `${pos.x}px`;
        el.style.top = `${pos.y}px`;
        el.style.willChange = 'transform, opacity';
        if (appliedScale !== 1.0) {
          el.style.transform = `scale(${appliedScale})`;
        }

        el.innerHTML = `
          <span class="relative flex items-center justify-center w-5 h-5 rounded-full shrink-0" style="background-color: ${isCredit ? 'rgba(22, 163, 74, 0.12)' : 'rgba(220, 38, 38, 0.12)'};">
            ${iconSvg}
            ${isCredit ? `<span class="credit-pulse-ring absolute inset-0 rounded-full border pointer-events-none" style="border-color: ${accentColor}; opacity: 0;"></span>` : ''}
          </span>
          <span class="font-semibold tabular-nums shrink-0" style="color: ${accentColor};">
            ${isCredit ? '+' : '-'} ${formatted}
          </span>
          <span class="text-black/60 font-medium shrink-0">
            ${tx.tag} ${isCredit ? 'Credited' : 'Debited'}
          </span>
        `;

        container.appendChild(el);

        const measuredW = el.offsetWidth || estimatedW;
        const measuredH = el.offsetHeight || estimatedH;

        const activeObj: ActiveItem = {
          id: `chip-${Date.now()}-${Math.random()}`,
          type: 'chip',
          x: pos.x,
          y: pos.y,
          width: measuredW,
          height: measuredH,
          driftY,
          scale: appliedScale,
          isFadingOut: false,
          el,
          tl: gsap.timeline(),
        };
        activeItems.push(activeObj);

        const floatDuration = gsap.utils.random(CONFIG.chip.floatSec[0], CONFIG.chip.floatSec[1]);
        const sway = Math.random() > 0.5 ? 6 : -6;

        activeObj.tl = gsap.timeline({
          onComplete: () => {
            el.style.willChange = 'auto';
            removeItem(activeObj);
          },
        });

        // 1. Pop-in: 0.2s, back.out(2)
        activeObj.tl.fromTo(
          el,
          { opacity: 0, scale: appliedScale * 0.6, y: 12 },
          { opacity: 1, scale: appliedScale, y: 0, duration: CONFIG.chip.popInSec, ease: 'back.out(2)' }
        );

        // Polish: fast pulse ring (0.5s) on credit, subtle nudge on debit
        if (isCredit) {
          const ring = el.querySelector('.credit-pulse-ring');
          if (ring) {
            gsap.fromTo(
              ring,
              { scale: 1, opacity: 0.35 },
              { scale: 1.35, opacity: 0, duration: 0.5, ease: 'power2.out', delay: 0.1 }
            );
          }
        } else {
          activeObj.tl.to(el, { y: '+=3', duration: 0.1, ease: 'power1.out' }, '+=0.04');
        }

        // 2. Float with sway
        activeObj.tl.to(
          el,
          {
            y: `-=${driftY}`,
            duration: floatDuration,
            ease: 'sine.out',
          },
          '-=0.06'
        );
        activeObj.tl.to(
          el,
          {
            x: `+=${sway}`,
            duration: floatDuration,
            ease: 'sine.inOut',
          },
          '<'
        );

        // 3. Quick fade-out: mark isFadingOut = true the exact moment fade begins
        activeObj.tl.to(
          el,
          {
            opacity: 0,
            scale: appliedScale * 0.96,
            duration: CONFIG.chip.fadeOutSec,
            ease: 'power1.in',
            onStart: () => {
              activeObj.isFadingOut = true;
            },
          },
          `-=${CONFIG.chip.fadeOutSec}`
        );

        if (!isTopup) scheduleNextChip();
        return true;
      }

      // ----------------------------------------------------
      // Spawn: Currency Symbol
      // ----------------------------------------------------
      function spawnSymbol() {
        if (isPaused) return;

        const { maxSymbols, isMobile } = getLimits();
        const currentSymbols = activeItems.filter((i) => i.type === 'symbol').length;
        if (currentSymbols >= maxSymbols) {
          scheduleNextSymbol();
          return;
        }

        const fontSize = Math.floor(isMobile ? gsap.utils.random(44, 75) : gsap.utils.random(56, 105));
        const driftY = Math.floor(gsap.utils.random(CONFIG.symbol.driftPx[0], CONFIG.symbol.driftPx[1]));
        const estimatedW = Math.floor(fontSize * 0.7);
        const estimatedH = fontSize;

        const { cardRect, crowdTop, vw } = getCardRectAndCrowd();
        const pos = findPosition(estimatedW, estimatedH, driftY, cardRect, crowdTop, vw, 0, 'symbol');
        if (!pos) {
          scheduleNextSymbol();
          return;
        }

        const symbol = CURRENCY_SYMBOLS[Math.floor(Math.random() * CURRENCY_SYMBOLS.length)];
        const el = document.createElement('div');
        el.className = 'absolute font-light pointer-events-none select-none tracking-tighter leading-none';
        el.style.fontSize = `${fontSize}px`;
        el.style.color = 'rgba(0, 0, 0, 0.07)';
        el.style.left = `${pos.x}px`;
        el.style.top = `${pos.y}px`;
        el.style.willChange = 'transform, opacity';
        el.textContent = symbol;

        container.appendChild(el);

        const measuredW = el.offsetWidth || estimatedW;
        const measuredH = el.offsetHeight || estimatedH;

        const activeObj: ActiveItem = {
          id: `sym-${Date.now()}-${Math.random()}`,
          type: 'symbol',
          x: pos.x,
          y: pos.y,
          width: measuredW,
          height: measuredH,
          driftY,
          scale: 1,
          isFadingOut: false,
          el,
          tl: gsap.timeline(),
        };
        activeItems.push(activeObj);

        const floatDuration = gsap.utils.random(CONFIG.symbol.floatSec[0], CONFIG.symbol.floatSec[1]);
        const rotation = gsap.utils.random(-10, 10);

        activeObj.tl = gsap.timeline({
          onComplete: () => {
            el.style.willChange = 'auto';
            removeItem(activeObj);
          },
        });

        // 1. Pop-in
        activeObj.tl.fromTo(
          el,
          { opacity: 0, scale: 0.6, y: 12 },
          { opacity: 1, scale: 1, y: 0, duration: CONFIG.symbol.popInSec, ease: 'back.out(2)' }
        );

        // 2. Float
        activeObj.tl.to(
          el,
          {
            y: `-=${driftY}`,
            rotation,
            duration: floatDuration,
            ease: 'sine.out',
          },
          '-=0.06'
        );

        // 3. Fade-out
        activeObj.tl.to(
          el,
          {
            opacity: 0,
            scale: 0.96,
            duration: CONFIG.symbol.fadeOutSec,
            ease: 'power1.in',
            onStart: () => {
              activeObj.isFadingOut = true;
            },
          },
          `-=${CONFIG.symbol.fadeOutSec}`
        );

        scheduleNextSymbol();
      }

      // ----------------------------------------------------
      // Scheduling loops with +/-20% jitter
      // ----------------------------------------------------
      function scheduleNextChip() {
        if (isPaused) return;
        const base = gsap.utils.random(CONFIG.chip.spawnEveryMs[0], CONFIG.chip.spawnEveryMs[1]);
        const jitter = base * (1 + (Math.random() * 0.4 - 0.2));
        chipTimeout = setTimeout(spawnChip, Math.round(jitter));
      }

      function scheduleNextSymbol() {
        if (isPaused) return;
        const base = gsap.utils.random(CONFIG.symbol.spawnEveryMs[0], CONFIG.symbol.spawnEveryMs[1]);
        const jitter = base * (1 + (Math.random() * 0.4 - 0.2));
        symbolTimeout = setTimeout(spawnSymbol, Math.round(jitter));
      }

      // ----------------------------------------------------
      // Dev stats hook (window.__floatingMoneyStats)
      // ----------------------------------------------------
      function updateDevStats() {
        if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
          const liveCount = activeItems.filter((i) => i.type === 'chip' && !i.isFadingOut).length;
          let visibleCount = 0;
          for (const item of activeItems) {
            if (item.type === 'chip') {
              const op = Number(gsap.getProperty(item.el, 'opacity')) || 0;
              if (op > 0.6) visibleCount++;
            }
          }
          (window as unknown as { __floatingMoneyStats?: { live: number; visible: number } }).__floatingMoneyStats = {
            live: liveCount,
            visible: visibleCount,
          };
        }
      }

      // ----------------------------------------------------
      // Watchdog (Every 100ms: hard guarantee of at least 6 chips on screen)
      // ----------------------------------------------------
      function triggerTopup() {
        topupTimeout = null;
        if (isPaused) return;

        const { minLive, maxChips } = getLimits();
        const liveCount = activeItems.filter((i) => i.type === 'chip' && !i.isFadingOut).length;
        const totalChips = activeItems.filter((i) => i.type === 'chip').length;

        if (liveCount < minLive && totalChips < maxChips) {
          const spawned = spawnChip(true);
          updateDevStats();
          if (spawned) {
            // Cap top-up spawns to 1 per 80ms until minLive is reached
            topupTimeout = setTimeout(triggerTopup, 80);
          }
        }
      }

      function runWatchdog() {
        if (isPaused) return;

        updateDevStats();

        const { minLive, maxChips } = getLimits();
        const liveCount = activeItems.filter((i) => i.type === 'chip' && !i.isFadingOut).length;
        const totalChips = activeItems.filter((i) => i.type === 'chip').length;

        // If live chips below minLive, top-up immediately (one every 80ms) until back at minLive
        if (liveCount < minLive && totalChips < maxChips && !topupTimeout) {
          triggerTopup();
        }
      }

      // ----------------------------------------------------
      // Accessibility: reduced motion (6 static chips, cross-fading every 3s)
      // ----------------------------------------------------
      if (prefersReducedMotion) {
        const { cardRect, crowdTop, vw } = getCardRectAndCrowd();
        const staticEntries = SAMPLE_TRANSACTIONS.slice(0, 6);
        const staticEls: HTMLElement[] = [];

        staticEntries.forEach((tx, idx) => {
          const isCredit = tx.type === 'credit';
          const accentColor = isCredit ? ACCENT_COLORS.credit : ACCENT_COLORS.debit;
          const formatted = formatAmount(tx.amount, tx.currency, tx.locale);
          const iconSvg = isCredit
            ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="7" x2="7" y2="17"></line><polyline points="17 17 7 17 7 7"></polyline></svg>`
            : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>`;

          const el = getChipElement(vw < 700);
          el.innerHTML = `
            <span class="relative flex items-center justify-center w-5 h-5 rounded-full shrink-0" style="background-color: ${isCredit ? 'rgba(22, 163, 74, 0.12)' : 'rgba(220, 38, 38, 0.12)'};">${iconSvg}</span>
            <span class="font-semibold tabular-nums shrink-0" style="color: ${accentColor};">${isCredit ? '+' : '-'} ${formatted}</span>
            <span class="text-black/60 font-medium shrink-0">${tx.tag} ${isCredit ? 'Credited' : 'Debited'}</span>
          `;

          // Position safely: 2 on left, 2 on right, 2 on top (or stacked safely)
          let posX = 32;
          let posY = 40 + idx * 45;
          if (idx < 2 && cardRect.left > 240) {
            posX = 32;
            posY = 50 + idx * 70;
          } else if (idx < 4 && vw - cardRect.right > 240) {
            posX = Math.min(vw - 230, cardRect.right + 20);
            posY = 50 + (idx - 2) * 70;
          } else {
            posX = Math.max(32, Math.min(vw - 230, (vw / 2) - 100 + (idx === 4 ? -80 : 80)));
            posY = Math.max(24, Math.min(cardRect.top - 50, 40));
          }

          if (posY > crowdTop - 40) posY = Math.max(24, crowdTop - 50);

          el.style.left = `${posX}px`;
          el.style.top = `${posY}px`;
          container.appendChild(el);
          gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.6 });
          staticEls.push(el);
        });

        // Cross-fade one entry every 3 seconds
        let rotateIdx = 0;
        let poolIdx = 6;
        const rotateTimer = setInterval(() => {
          if (staticEls.length === 0) return;
          const targetEl = staticEls[rotateIdx % staticEls.length];
          const newTx = SAMPLE_TRANSACTIONS[poolIdx % SAMPLE_TRANSACTIONS.length];
          rotateIdx++;
          poolIdx++;

          const isCredit = newTx.type === 'credit';
          const accentColor = isCredit ? ACCENT_COLORS.credit : ACCENT_COLORS.debit;
          const formatted = formatAmount(newTx.amount, newTx.currency, newTx.locale);
          const iconSvg = isCredit
            ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="7" x2="7" y2="17"></line><polyline points="17 17 7 17 7 7"></polyline></svg>`
            : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>`;

          gsap.to(targetEl, {
            opacity: 0,
            duration: 0.4,
            onComplete: () => {
              targetEl.innerHTML = `
                <span class="relative flex items-center justify-center w-5 h-5 rounded-full shrink-0" style="background-color: ${isCredit ? 'rgba(22, 163, 74, 0.12)' : 'rgba(220, 38, 38, 0.12)'};">${iconSvg}</span>
                <span class="font-semibold tabular-nums shrink-0" style="color: ${accentColor};">${isCredit ? '+' : '-'} ${formatted}</span>
                <span class="text-black/60 font-medium shrink-0">${newTx.tag} ${isCredit ? 'Credited' : 'Debited'}</span>
              `;
              gsap.to(targetEl, { opacity: 1, duration: 0.4 });
            },
          });
        }, 3000);

        // Update dev stats for reduced motion
        if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
          (window as unknown as { __floatingMoneyStats?: { live: number; visible: number } }).__floatingMoneyStats = {
            live: 6,
            visible: 6,
          };
        }

        return () => {
          clearInterval(rotateTimer);
          staticEls.forEach((el) => el.remove());
        };
      }

      // ----------------------------------------------------
      // Initial Burst: 10 chips popping within ~1s
      // ----------------------------------------------------
      for (let i = 0; i < CONFIG.initialBurst.count; i++) {
        const t = setTimeout(() => {
          if (isPaused) return;
          spawnChip();
        }, i * CONFIG.initialBurst.staggerMs);
        burstTimeouts.push(t);
      }

      // Regular spawn timers
      chipTimeout = setTimeout(spawnChip, 200);
      symbolTimeout = setTimeout(spawnSymbol, 450);

      // Start watchdog loop (100ms)
      watchdogInterval = setInterval(runWatchdog, 100);

      // ----------------------------------------------------
      // Resize handling (debounced 150ms)
      // ----------------------------------------------------
      const handleResize = () => {
        if (resizeTimeout) clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          updateGrid();

          const { cardRect, crowdTop, vw } = getCardRectAndCrowd();

          [...activeItems].forEach((item) => {
            const inCard = !(
              item.x + item.width < cardRect.left ||
              item.x > cardRect.right ||
              item.y + item.height < cardRect.top ||
              item.y > cardRect.bottom
            );
            const inCrowd = item.y + item.height > crowdTop;
            const offScreen = item.x < 12 || item.x + item.width > vw - 12 || item.y < 12;

            if (inCard || inCrowd || offScreen) {
              gsap.to(item.el, {
                opacity: 0,
                scale: 0.9,
                duration: 0.15,
                onComplete: () => removeItem(item),
              });
            }
          });
        }, 150);
      };

      window.addEventListener('resize', handleResize);

      // ----------------------------------------------------
      // Tab visibility change (smooth recovery, no burst)
      // ----------------------------------------------------
      const handleVisibilityChange = () => {
        if (document.hidden) {
          isPaused = true;
          if (chipTimeout) clearTimeout(chipTimeout);
          if (symbolTimeout) clearTimeout(symbolTimeout);
          if (topupTimeout) clearTimeout(topupTimeout);
          burstTimeouts.forEach(clearTimeout);
        } else {
          isPaused = false;
          scheduleNextChip();
          scheduleNextSymbol();
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
        window.removeEventListener('resize', handleResize);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    });

    return () => {
      if (chipTimeout) clearTimeout(chipTimeout);
      if (symbolTimeout) clearTimeout(symbolTimeout);
      if (topupTimeout) clearTimeout(topupTimeout);
      if (watchdogInterval) clearInterval(watchdogInterval);
      if (resizeTimeout) clearTimeout(resizeTimeout);
      burstTimeouts.forEach(clearTimeout);
      activeItems.forEach((i) => {
        i.tl.kill();
        i.el.remove();
      });
      activeItems.length = 0;
      chipPool.length = 0;
      ctx.revert();
    };
  }, []);

  if (!ENABLE_FLOATING_MONEY) return null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-[5] overflow-hidden pointer-events-none select-none"
      aria-hidden="true"
    />
  );
}
