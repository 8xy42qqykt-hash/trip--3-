import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Eye, EyeSlash } from '@phosphor-icons/react';
import { handleEnterKeyNavigation } from '../../utils/formNavigation';
import { Avatar } from '../common/Avatar';
import tripLogo from '../../../trip-logo.png';

export const AuthScreen: React.FC = () => {
  const { signIn, signUp, savedAccounts } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || (isSignUp && !displayName)) return;
    setError(null);
    setSubmitting(true);
    try {
      if (isSignUp) {
        const res = await signUp(email, password, displayName);
        if (res.error) setError(res.error);
      } else {
        const res = await signIn(email, password);
        if (res.error) setError(res.error);
      }
    } catch (err: any) {
      setError(err?.message || 'Error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const selectSavedAccount = (acc: { email: string; displayName: string }) => {
    setEmail(acc.email);
    setIsSignUp(false);
    setError(null);
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-center px-5 py-8 max-w-md mx-auto bg-black text-white select-none">
      {/* Brand Header */}
      <div className="mb-8 text-center flex flex-col items-center">
        <img src={tripLogo} alt="Trip" className="w-18 h-18 object-contain mb-4" />
        <h1 className="text-4xl font-extrabold tracking-tight text-white">
          Trip
        </h1>
        <p className="text-sm text-slate-400 mt-1.5">
          {isSignUp ? 'Create your account' : 'Sign in to access your trips'}
        </p>
      </div>

      {/* Saved Accounts quick-picker */}
      {savedAccounts.length > 0 && !isSignUp && (
        <div className="mb-5">
          <div className="text-xs font-semibold text-slate-400 px-1 mb-2">
            Switch Account
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {savedAccounts.map((acc) => (
              <button
                key={acc.email}
                type="button"
                onClick={() => selectSavedAccount(acc)}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-[18px] border text-xs active-press cursor-pointer transition-colors ${
                  email === acc.email
                    ? 'bg-[#0A84FF]/20 border-[#0A84FF] text-white'
                    : 'bg-[#1c1c1e] border-white/10 text-slate-300 hover:bg-[#242428]'
                }`}
              >
                <Avatar
                  name={acc.displayName}
                  avatarUrl={acc.avatarUrl}
                  color={acc.color}
                  size={26}
                />
                <span className="font-semibold truncate max-w-[120px]">{acc.displayName}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-[22px] bg-[#1c1c1e] divide-y divide-white/[0.08] overflow-hidden border border-white/[0.08] shadow-sm">
          {isSignUp && (
            <div className="px-4.5 py-3">
              <input
                type="text"
                inputMode="text"
                autoComplete="name"
                enterKeyHint="next"
                autoCapitalize="words"
                placeholder="Display Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyDown={(e) => handleEnterKeyNavigation(e)}
                required={isSignUp}
                className="w-full h-11 bg-transparent text-white placeholder:text-slate-500 text-[17px] outline-none"
              />
            </div>
          )}
          <div className="px-4.5 py-3">
            <input
              type="text"
              inputMode="email"
              autoComplete="username"
              enterKeyHint="next"
              autoCapitalize="none"
              placeholder="Email or Name"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => handleEnterKeyNavigation(e)}
              required
              className="w-full h-11 bg-transparent text-white placeholder:text-slate-500 text-[17px] outline-none"
            />
          </div>
          <div className="px-4.5 py-3 flex items-center justify-between gap-2">
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              enterKeyHint="go"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => handleEnterKeyNavigation(e)}
              required
              className="w-full h-11 bg-transparent text-white placeholder:text-slate-500 text-[17px] outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-slate-400 hover:text-white p-2 cursor-pointer active:scale-95"
            >
              {showPassword ? <EyeSlash size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-400 text-center px-4 py-3 bg-red-500/15 rounded-[18px] border border-red-500/20">
            {error}
          </div>
        )}

        {/* Primary Action Button */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full h-13 rounded-[22px] bg-[#0A84FF] text-white font-bold text-base flex items-center justify-center active-press cursor-pointer disabled:opacity-50 shadow-md hover:bg-[#007AFF] transition-colors"
        >
          {submitting ? 'Please wait...' : isSignUp ? 'Sign Up' : 'Sign In'}
        </button>

        {/* Secondary switch button */}
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
            }}
            className="text-sm font-semibold text-[#0A84FF] active-press cursor-pointer hover:opacity-85 transition-opacity py-1 px-3"
          >
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
          </button>
        </div>
      </form>
    </div>
  );
};
