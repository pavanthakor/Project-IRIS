import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { getErrorMessage } from '../../services/api';

export default function RegisterModal() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { register, loading } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setError(null);
    try {
      await register(email, password, email);
      // The AuthProvider will handle navigation on successful registration
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="iris-input"
        required
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="iris-input"
        required
      />
      <input
        type="password"
        placeholder="Confirm Password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        className="iris-input"
        required
      />
      {error && <p className="text-sm text-iris-danger">{error}</p>}
      <button type="submit" className="iris-btn-primary w-full" disabled={loading}>
        {loading ? 'Registering...' : 'Create Account'}
      </button>
    </form>
  );
}
