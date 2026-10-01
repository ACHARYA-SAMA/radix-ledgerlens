"use client";

import React, { useState } from 'react';
import { Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  showStrength?: boolean;
  strength?: 'weak' | 'fair' | 'good' | 'strong';
  autoComplete?: string;
  placeholder?: string;
}

export default function PasswordField({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  showStrength,
  strength,
  autoComplete,
  placeholder
}: PasswordFieldProps) {
  const [showPassword, setShowPassword] = useState(false);

  const getStrengthWord = (strength: string | undefined) => {
    switch (strength) {
      case 'weak': return 'Weak';
      case 'fair': return 'Fair';
      case 'good': return 'Good';
      case 'strong': return 'Strong';
      default: return '';
    }
  };

  return (
    <div className="w-full font-[family-name:var(--font-sans)]">
      <label htmlFor={id} className="block text-[12px] uppercase tracking-[0.08em] text-black/60 mb-2">
        {label}
      </label>
      <div className={`relative h-12 rounded-xl border bg-white transition-all duration-150 focus-within:border-black focus-within:ring-4 focus-within:ring-black/8 ${error ? 'border-red-500 ring-4 ring-red-500/15 focus-within:border-red-500 focus-within:ring-red-500/15' : 'border-black/12'}`}>
        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-black/45 pointer-events-none" />
        <input
          id={id}
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          autoComplete={autoComplete}
          placeholder={placeholder}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className="w-full h-full pl-12 pr-12 bg-transparent outline-none text-sm text-black"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          aria-pressed={showPassword}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-black/40 hover:text-black/80 transition-colors"
        >
          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      
      {error && (
        <div id={`${id}-error`} className="flex items-center gap-1 mt-1 text-xs text-red-600">
          <AlertCircle className="w-3 h-3" />
          <span>{error}</span>
        </div>
      )}

      {showStrength && value.length > 0 && (
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1 flex gap-1">
            <div className={`h-1 flex-1 rounded-full ${strength === 'weak' || strength === 'fair' || strength === 'good' || strength === 'strong' ? (strength === 'weak' ? 'bg-red-500' : strength === 'fair' ? 'bg-orange-500' : strength === 'good' ? 'bg-yellow-500' : 'bg-green-500') : 'bg-black/10'}`} />
            <div className={`h-1 flex-1 rounded-full ${strength === 'fair' || strength === 'good' || strength === 'strong' ? (strength === 'fair' ? 'bg-orange-500' : strength === 'good' ? 'bg-yellow-500' : 'bg-green-500') : 'bg-black/10'}`} />
            <div className={`h-1 flex-1 rounded-full ${strength === 'good' || strength === 'strong' ? (strength === 'good' ? 'bg-yellow-500' : 'bg-green-500') : 'bg-black/10'}`} />
            <div className={`h-1 flex-1 rounded-full ${strength === 'strong' ? 'bg-green-500' : 'bg-black/10'}`} />
          </div>
          <span className="text-xs text-black/60 font-medium min-w-[40px] text-right">
            {getStrengthWord(strength)}
          </span>
        </div>
      )}
    </div>
  );
}
