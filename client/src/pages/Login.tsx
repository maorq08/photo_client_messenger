import { useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { authForgotPassword } from '../api';
import './Login.css';

type View = 'login' | 'signup' | 'forgot';

export default function Login() {
  const { login, signup } = useAuth();
  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (view === 'signup') {
        await signup(email, password, name);
      } else if (view === 'forgot') {
        await authForgotPassword(email);
        setSuccess('If an account exists with this email, you will receive a password reset link.');
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  function switchView(newView: View) {
    setView(newView);
    setError('');
    setSuccess('');
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Client Messenger</h1>
        <p className="login-subtitle">
          {view === 'signup' && 'Create your account'}
          {view === 'login' && 'Sign in to continue'}
          {view === 'forgot' && 'Reset your password'}
        </p>

        <form onSubmit={handleSubmit} className="login-form">
          {view === 'signup' && (
            <div className="form-group">
              <label htmlFor="name">Your Name</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alex Smith"
                autoComplete="name"
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>

          {view !== 'forgot' && (
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={view === 'signup' ? 'At least 8 characters' : 'Your password'}
                required
                minLength={view === 'signup' ? 8 : undefined}
                autoComplete={view === 'signup' ? 'new-password' : 'current-password'}
              />
            </div>
          )}

          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? 'Please wait...' :
              view === 'signup' ? 'Create Account' :
              view === 'forgot' ? 'Send Reset Link' :
              'Sign In'}
          </button>
        </form>

        <div className="login-footer">
          {view === 'signup' && (
            <p>
              Already have an account?{' '}
              <button type="button" onClick={() => switchView('login')}>
                Sign in
              </button>
            </p>
          )}
          {view === 'login' && (
            <>
              <p>
                Don't have an account?{' '}
                <button type="button" onClick={() => switchView('signup')}>
                  Create one
                </button>
              </p>
              <p>
                <button type="button" onClick={() => switchView('forgot')}>
                  Forgot password?
                </button>
              </p>
            </>
          )}
          {view === 'forgot' && (
            <p>
              Remember your password?{' '}
              <button type="button" onClick={() => switchView('login')}>
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
