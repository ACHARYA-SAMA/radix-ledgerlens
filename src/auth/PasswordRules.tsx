"use client";

import React from 'react';
import { Circle, CheckCircle2 } from 'lucide-react';

interface PasswordRulesProps {
  rules: Array<{ id: string; label: string; passed: boolean }>;
  showMatchRule?: boolean;
  passwordsMatch?: boolean;
}

export default function PasswordRules({ rules, showMatchRule, passwordsMatch }: PasswordRulesProps) {
  return (
    <div aria-live="polite" className="flex flex-col gap-1.5 mt-3 font-[family-name:var(--font-sans)]">
      {rules.map((rule) => (
        <div key={rule.id} className="flex items-center gap-2 text-[12px] transition-colors duration-150">
          {rule.passed ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0 transition-colors duration-150" />
          ) : (
            <Circle className="w-3.5 h-3.5 opacity-30 shrink-0 transition-colors duration-150 text-black" />
          )}
          <span className={`${rule.passed ? 'text-black/80' : 'text-black/40'} transition-colors duration-150`}>
            {rule.label}
          </span>
        </div>
      ))}
      
      {showMatchRule && (
        <div className="flex items-center gap-2 text-[12px] transition-colors duration-150">
          {passwordsMatch ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0 transition-colors duration-150" />
          ) : (
            <Circle className="w-3.5 h-3.5 opacity-30 shrink-0 transition-colors duration-150 text-black" />
          )}
          <span className={`${passwordsMatch ? 'text-black/80' : 'text-black/40'} transition-colors duration-150`}>
            Passwords match
          </span>
        </div>
      )}
    </div>
  );
}
