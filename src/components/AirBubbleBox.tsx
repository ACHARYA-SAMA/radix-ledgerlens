import React, { useRef, useState } from 'react';
import { sound } from '../utils/audioSynthesizer';

interface AirBubbleBoxProps {
  children: React.ReactNode | ((isHovered: boolean) => React.ReactNode);
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  soundPitch?: number;
}

export const AirBubbleBox: React.FC<AirBubbleBoxProps> = ({
  children,
  className = '',
  onClick,
  soundPitch = 0.6
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseEnter = () => {
    setIsHovered(true);
    sound.playPluck(soundPitch, 0.25);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      className={`relative overflow-hidden cursor-pointer select-none transition-all duration-300 ${className} ${
        isHovered
          ? 'bg-white border-2 border-white shadow-[0_15px_40px_rgba(255,255,255,0.35)] text-black'
          : 'border border-white/25 bg-gradient-to-b from-zinc-800/80 via-zinc-900/90 to-zinc-950/95 shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.35),0_8px_30px_rgba(0,0,0,0.6)] backdrop-blur-xl text-slate-100'
      }`}
    >
      <div className="relative z-10 w-full h-full">
        {typeof children === 'function' ? children(isHovered) : children}
      </div>
    </div>
  );
};
