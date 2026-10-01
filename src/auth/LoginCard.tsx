"use client";

import React, { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { Mail, CheckCircle2, AlertCircle, Loader2, Sparkles } from 'lucide-react';
import PasswordField from './PasswordField';
import PasswordRules from './PasswordRules';
import { validateEmail, validatePassword, validatePasswordMatch, generateStrongPassword } from './validation';
import { supabase } from '../lib/supabase';

interface LoginCardProps {
  initialMode?: 'signin' | 'signup';
  initialEmail?: string;
}

export default function LoginCard({ initialMode = 'signin', initialEmail = '' }: LoginCardProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [emailTouched, setEmailTouched] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);
  
  const [serverError, setServerError] = useState<{ message: string; code?: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showSuggestedPassword, setShowSuggestedPassword] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const emailValidation = validateEmail(email);
  const emailValid = emailValidation.valid && email.length > 0;
  const emailError = (emailTouched || formSubmitted) && !emailValidation.valid ? (emailValidation.error || 'Invalid email') : '';
  const emailSuggestion = emailValidation.suggestion || '';

  const handleSuggestPassword = () => {
    const strongPass = generateStrongPassword();
    setPassword(strongPass);
    setConfirmPassword(strongPass);
    setShowSuggestedPassword(true);
    setTimeout(() => {
      setShowSuggestedPassword(false);
    }, 3000);
  };

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion || !cardRef.current) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        cardRef.current,
        {
          y: 24,
          opacity: 0,
          scale: 0.98,
        },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 0.7,
          ease: 'power3.out',
        }
      );
    });

    return () => ctx.revert();
  }, []);

  const shakeForm = () => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!prefersReducedMotion && formRef.current) {
      gsap.to(formRef.current, {
        x: 6,
        duration: 0.08,
        repeat: 5,
        yoyo: true,
        ease: 'power2.inOut',
        clearProps: 'x'
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitted(true);
    setServerError(null);

    if (!emailValidation.valid) {
      shakeForm();
      return;
    }

    if (mode === 'signin') {
      if (!password) {
        shakeForm();
        return;
      }
    } else {
      const { allPassed } = validatePassword(password, email);
      const matchOk = validatePasswordMatch(password, confirmPassword);
      if (!allPassed || !matchOk) {
        shakeForm();
        return;
      }
    }

    setIsLoading(true);

    if (!supabase) {
      setServerError({ message: 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.' });
      setIsLoading(false);
      return;
    }
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          setSuccessMessage('Check your email for a confirmation link, then sign in.');
          setIsSuccess(true);
        }
      }
    } catch (error) {
      setServerError({ message: (error as Error).message });
      shakeForm();
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setServerError(null);
    if (!supabase) {
      setServerError({ message: 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.' });
      return;
    }
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) { setServerError({ message: error.message }); setIsLoading(false); }
  };

  const switchMode = (newMode: 'signin' | 'signup') => {
    setMode(newMode);
    setPassword('');
    setConfirmPassword('');
    setServerError(null);
    setFormSubmitted(false);
    setIsSuccess(false);
  };

  const { rules, allPassed: passwordPassed, strength } = validatePassword(password, email);
  const passwordsMatch = validatePasswordMatch(password, confirmPassword);
  
  const isSubmitDisabled = isLoading || (mode === 'signup' && (!emailValid || !passwordPassed || !passwordsMatch));

  return (
    <div 
      ref={cardRef}
      className="w-full max-w-[420px] mx-4 bg-white/95 backdrop-blur-xl border border-black/10 rounded-3xl p-6 md:p-8 font-[family-name:var(--font-sans)] relative z-10 shadow-2xl shadow-black/10"
      style={{ boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 20px 40px -4px rgba(0,0,0,0.1)' }}
    >
      {isSuccess ? (
        <div className="flex flex-col items-center text-center py-2">
          <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-black mb-1">
            {successMessage.startsWith('Password') ? 'Check your email' : 'Confirm your email'}
          </h2>
          <p className="text-sm text-black/60 mb-6">
            {successMessage} <span className="font-semibold text-black break-all">{email}</span>
          </p>

          <div className="w-full bg-black/[0.03] border border-black/10 rounded-2xl p-4 text-xs text-black/70 mb-6 text-left">
            <div className="font-semibold text-black mb-1 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Email confirmation
            </div>
            Return here after confirming your email to access LedgerLens.
          </div>

          <button
            type="button"
            onClick={() => {
              setMode('signin');
              setIsSuccess(false);
              setSuccessMessage('');
              setEmail('');
              setPassword('');
              setConfirmPassword('');
              setFormSubmitted(false);
            }}
            className="w-full h-12 rounded-xl bg-black text-white font-medium flex items-center justify-center gap-2 hover:bg-neutral-800 transition-colors"
          >
            Back to sign in
          </button>
        </div>
      ) : (
        <>
          <div className="mb-6">
        <h1 className="text-[28px] font-semibold tracking-tight text-black">
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </h1>
        <p className="text-sm text-black/60 mt-1">
          {mode === 'signin' ? 'Welcome back' : 'Get started for free'}
        </p>
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-5 transition-all duration-300">
        <div>
          <label htmlFor="email" className="block text-[12px] uppercase tracking-[0.08em] text-black/60 mb-2">
            EMAIL
          </label>
          <div className={`relative h-12 rounded-xl border bg-white transition-all duration-150 focus-within:border-black focus-within:ring-4 focus-within:ring-black/8 ${emailError && (emailTouched || formSubmitted) ? 'border-red-500 ring-4 ring-red-500/15 focus-within:border-red-500 focus-within:ring-red-500/15' : 'border-black/[0.12]'}`}>
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-black/45 pointer-events-none" />
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setEmailTouched(true)}
              aria-invalid={!!(emailError && (emailTouched || formSubmitted))}
              aria-describedby={emailError ? 'email-error' : undefined}
              className="w-full h-full pl-12 pr-12 bg-transparent outline-none text-sm text-black"
            />
            {emailValid && email.length > 0 && (
              <CheckCircle2 className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-green-600 pointer-events-none" />
            )}
          </div>
          {emailError && (emailTouched || formSubmitted) && (
            <div id="email-error" className="flex items-center gap-1 mt-1 text-xs text-red-600">
              <AlertCircle className="w-3 h-3" />
              <span>{emailError}</span>
            </div>
          )}
          {emailSuggestion && (
            <div className="mt-1">
              <span className="text-xs text-black/60">Did you mean </span>
              <button 
                type="button" 
                onClick={() => setEmail(emailSuggestion)}
                className="text-xs text-blue-600 hover:underline cursor-pointer"
              >
                {emailSuggestion}
              </button>
              <span className="text-xs text-black/60">?</span>
            </div>
          )}
        </div>

        <PasswordField
          id="password"
          label="PASSWORD"
          value={password}
          onChange={setPassword}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          showStrength={mode === 'signup'}
          strength={strength}
          error={formSubmitted && mode === 'signin' && !password ? 'Password is required' : undefined}
        />

        {mode === 'signup' && (
          <>
            <PasswordField
              id="confirmPassword"
              label="CONFIRM PASSWORD"
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
            />
            
            <PasswordRules 
              rules={rules} 
              showMatchRule={true} 
              passwordsMatch={passwordsMatch} 
            />

            <button
              type="button"
              onClick={handleSuggestPassword}
              className="self-start flex items-center gap-1 text-xs text-black/50 hover:text-black/80 transition-colors mt-1"
            >
              <Sparkles className="w-3 h-3 text-amber-500" />
              {showSuggestedPassword ? "Generated & copied to inputs!" : "Suggest a strong password"}
            </button>
          </>
        )}

        {mode === 'signin' && (
          <div className="flex justify-end -mt-2">
            <button type="button" className="text-xs text-black/50 hover:text-black/80" onClick={async () => {
              if (!supabase) { setServerError({ message: 'Supabase is not configured.' }); return; }
              if (!emailValidation.valid) { setEmailTouched(true); return; }
              const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
              if (error) setServerError({ message: error.message });
              else { setSuccessMessage('Password reset link sent to'); setIsSuccess(true); }
            }}>Forgot password?</button>
          </div>
        )}

        {serverError && (
          <div role="alert" className="relative z-20 rounded-xl p-3 bg-red-50 border border-red-200 mt-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
              <div className="flex flex-col">
                <span className="text-sm text-red-700">{serverError.message}</span>
                {serverError.code === 'ACCOUNT_NOT_FOUND' && (
                  <button 
                    type="button"
                    onClick={() => switchMode('signup')}
                    className="text-sm font-medium text-red-700 hover:text-red-900 underline text-left mt-1"
                  >
                    Create account with this email
                  </button>
                )}
                {serverError.code === 'EMAIL_ALREADY_EXISTS' && (
                  <button 
                    type="button"
                    onClick={() => switchMode('signin')}
                    className="text-sm font-medium text-red-700 hover:text-red-900 underline text-left mt-1"
                  >
                    Sign in instead
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitDisabled}
          className={`w-full h-12 mt-4 rounded-xl bg-black text-white font-medium flex items-center justify-center gap-2 transition-all duration-150 ${isSubmitDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:-translate-y-[1px] hover:shadow-lg active:scale-[0.98]'}`}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {mode === 'signin' ? 'Signing in...' : 'Creating account...'}
            </>
          ) : (
            mode === 'signin' ? 'Sign in' : 'Create account'
          )}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-black/35"><span className="h-px flex-1 bg-black/10" />OR<span className="h-px flex-1 bg-black/10" /></div>
      <button type="button" disabled={isLoading} onClick={handleGoogleSignIn}
        className="w-full h-12 rounded-xl border border-black/15 bg-white text-black font-medium flex items-center justify-center gap-3 hover:bg-neutral-50 disabled:opacity-50 transition-colors">
        <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.25 5.48-4.76 7.18l7.73 6C44.42 38.03 46.98 31.88 46.98 24.55z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.6.27-3.14.76-4.59l-7.98-6.2A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.92-2.13 15.89-5.8l-7.73-6c-2.14 1.44-4.88 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.97 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        Continue with Google
      </button>

      <div className="mt-5 text-sm text-black/60 text-center">
        {mode === 'signin' ? (
          <>
            Don&apos;t have an account?{' '}
            <button type="button" onClick={() => switchMode('signup')} className="font-medium text-black hover:underline">
              Create one
            </button>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <button type="button" onClick={() => switchMode('signin')} className="font-medium text-black hover:underline">
              Sign in
            </button>
          </>
        )}
      </div>
        </>
      )}
    </div>
  );
}
