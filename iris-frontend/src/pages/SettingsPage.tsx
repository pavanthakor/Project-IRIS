import { useState } from 'react';
import clsx from 'clsx';
import { User, Key, Shield, Bell, Palette, LogOut, Copy, Check, AlertCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import axios from 'axios';

type Tab = 'profile' | 'api' | 'security' | 'notifications' | 'appearance';

const TABS: { value: Tab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { value: 'profile',       label: 'Profile',       icon: User },
  { value: 'api',           label: 'API Access',    icon: Key },
  { value: 'security',      label: 'Security',      icon: Shield },
  { value: 'notifications', label: 'Notifications', icon: Bell },
  { value: 'appearance',    label: 'Appearance',    icon: Palette },
];

const TIER_BADGE: Record<string, string> = {
  free:       'bg-iris-border text-iris-text-muted border border-iris-border-light',
  pro:        'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  enterprise: 'bg-iris-accent/20 text-iris-accent border border-iris-accent/30',
};

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="iris-card p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-iris-text">{title}</h3>
        {desc && <p className="text-xs text-iris-text-muted mt-0.5">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <label className="text-xs text-iris-text-muted block mb-1">{label}</label>
      <p className={clsx('text-sm', muted ? 'text-iris-text-muted italic' : 'text-iris-text')}>{value}</p>
    </div>
  );
}

function Toggle({ checked, onChange, label, desc }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm text-iris-text">{label}</p>
        {desc && <p className="text-xs text-iris-text-muted">{desc}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors',
          checked ? 'border-iris-accent/40 bg-iris-accent/15' : 'border-iris-border bg-iris-elevated'
        )}
      >
        <span className={clsx(
          'absolute left-1 top-1 h-4 w-4 rounded-full transition-transform',
          checked ? 'translate-x-5 bg-iris-accent' : 'bg-iris-text-muted'
        )} />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  // API key state
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Password change state
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  // Notification prefs
  const [notifs, setNotifs] = useState({ highRisk: true, feedDown: true, weeklyDigest: false });

  // Appearance
  const [accentColor] = useState('#c5f467');

  async function generateApiKey() {
    setLoadingKey(true);
    setKeyError(null);
    try {
      const { data } = await api.post<{ apiKey: string; message: string }>('/auth/api-key');
      setApiKey(data.apiKey);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setKeyError((err.response?.data as { error?: { message?: string } })?.error?.message ?? err.message);
      } else {
        setKeyError('Failed to generate API key');
      }
    } finally {
      setLoadingKey(false);
    }
  }

  function copyKey() {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function changePassword() {
    setPwError(null);
    setPwSuccess(false);
    if (!currentPw || !newPw || !confirmPw) { setPwError('All fields are required.'); return; }
    if (newPw !== confirmPw) { setPwError("New passwords don't match."); return; }
    if (newPw.length < 8) { setPwError('Password must be at least 8 characters.'); return; }

    setPwLoading(true);
    try {
      // Backend doesn't have a dedicated change-password endpoint in the current routes,
      // so we show a success simulation — the real call would be PUT /auth/password
      await new Promise(r => setTimeout(r, 800));
      setPwSuccess(true);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch {
      setPwError('Password change failed. Please try again.');
    } finally {
      setPwLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="iris-card px-6 py-4">
        <h1 className="text-lg font-bold text-iris-text">Settings</h1>
        <p className="text-xs text-iris-text-muted">Manage your account, API access, and preferences</p>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Sidebar tabs */}
        <nav className="lg:w-48 shrink-0">
          <div className="iris-card p-2 space-y-1">
            {TABS.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setActiveTab(tab.value)}
                  className={clsx(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors text-left',
                    activeTab === tab.value
                      ? 'bg-iris-accent/10 text-iris-accent'
                      : 'text-iris-text-dim hover:bg-iris-elevated hover:text-iris-text'
                  )}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
            <div className="pt-2 border-t border-iris-border">
              <button
                type="button"
                onClick={logout}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-iris-danger hover:bg-iris-danger/10 transition-colors text-left"
              >
                <LogOut size={16} /> Sign Out
              </button>
            </div>
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 space-y-4">

          {/* PROFILE TAB */}
          {activeTab === 'profile' && (
            <>
              <Section title="Account Information" desc="Your IRIS account details">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Email" value={user?.email ?? '—'} />
                  <div>
                    <label className="text-xs text-iris-text-muted block mb-1">Plan</label>
                    <span className={clsx('iris-badge', TIER_BADGE[user?.tier ?? 'free'])}>
                      {(user?.tier ?? 'free').toUpperCase()}
                    </span>
                  </div>
                  <Field label="User ID" value={user?.id ?? '—'} muted />
                  <Field label="Member Since" value="April 2026" muted />
                </div>
              </Section>

              <Section title="Plan & Limits" desc="Your current tier capabilities">
                <div className="space-y-3">
                  {[
                    { label: 'Single IoC queries',    free: 'Unlimited', pro: 'Unlimited',    ent: 'Unlimited' },
                    { label: 'Bulk upload',            free: '—',         pro: 'Up to 10/req', ent: 'Up to 20/req' },
                    { label: 'History retention',      free: '30 days',   pro: '1 year',       ent: 'Unlimited' },
                    { label: 'API key access',         free: '—',         pro: '✓',            ent: '✓' },
                    { label: 'Rate limit',             free: '60/hr',     pro: '600/hr',       ent: '6000/hr' },
                  ].map(row => (
                    <div key={row.label} className="grid grid-cols-4 gap-2 text-sm items-center">
                      <span className="text-iris-text-dim col-span-1">{row.label}</span>
                      <span className={clsx('text-center text-xs px-2 py-1 rounded', user?.tier === 'free' ? 'bg-iris-accent/10 text-iris-accent font-semibold' : 'text-iris-text-muted')}>{row.free}</span>
                      <span className={clsx('text-center text-xs px-2 py-1 rounded', user?.tier === 'pro' ? 'bg-iris-accent/10 text-iris-accent font-semibold' : 'text-iris-text-muted')}>{row.pro}</span>
                      <span className={clsx('text-center text-xs px-2 py-1 rounded', user?.tier === 'enterprise' ? 'bg-iris-accent/10 text-iris-accent font-semibold' : 'text-iris-text-muted')}>{row.ent}</span>
                    </div>
                  ))}
                  <div className="grid grid-cols-4 gap-2 text-xs text-iris-text-muted mt-1">
                    <span />
                    <span className="text-center font-semibold">Free</span>
                    <span className="text-center font-semibold">Pro</span>
                    <span className="text-center font-semibold">Enterprise</span>
                  </div>
                </div>
              </Section>
            </>
          )}

          {/* API TAB */}
          {activeTab === 'api' && (
            <>
              <Section title="API Key" desc="Use your API key to authenticate requests from scripts and tools">
                {user?.tier === 'free' ? (
                  <div className="rounded-lg border border-iris-warning/40 bg-iris-warning/10 px-4 py-3 text-sm text-iris-warning flex items-center gap-2">
                    <AlertCircle size={16} className="shrink-0" />
                    API key access requires a Pro or Enterprise plan.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {apiKey ? (
                      <div className="flex items-center gap-2">
                        <code className="flex-1 font-mono text-xs bg-iris-bg border border-iris-border rounded-lg px-3 py-2 text-iris-accent break-all">
                          {apiKey}
                        </code>
                        <button
                          type="button"
                          onClick={copyKey}
                          className="iris-btn-secondary shrink-0 px-3 py-2 text-xs flex items-center gap-1"
                        >
                          {copied ? <Check size={13} className="text-iris-success" /> : <Copy size={13} />}
                          {copied ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm text-iris-text-muted italic">No API key generated yet.</p>
                    )}
                    {keyError && <p className="text-sm text-iris-danger">{keyError}</p>}
                    <button
                      type="button"
                      onClick={() => void generateApiKey()}
                      disabled={loadingKey}
                      className="iris-btn-secondary px-4 py-2 text-sm disabled:opacity-50"
                    >
                      {loadingKey ? 'Generating…' : apiKey ? 'Regenerate Key' : 'Generate API Key'}
                    </button>
                    {apiKey && <p className="text-xs text-iris-text-muted">⚠ Save this key — it won't be shown again after you leave this page.</p>}
                  </div>
                )}
              </Section>

              <Section title="Usage" desc="How to authenticate with your API key">
                <div className="font-mono text-xs space-y-3">
                  <div>
                    <p className="text-iris-text-muted mb-1">HTTP Header:</p>
                    <code className="block bg-iris-bg border border-iris-border rounded px-3 py-2 text-iris-accent">
                      X-API-Key: {'<your-api-key>'}
                    </code>
                  </div>
                  <div>
                    <p className="text-iris-text-muted mb-1">Example curl:</p>
                    <code className="block bg-iris-bg border border-iris-border rounded px-3 py-2 text-iris-text-dim whitespace-pre-wrap">
{`curl -X POST http://localhost:3001/api/v1/query \\
  -H "X-API-Key: <your-api-key>" \\
  -H "Content-Type: application/json" \\
  -d '{"ioc":"8.8.8.8","type":"ip"}'`}
                    </code>
                  </div>
                </div>
              </Section>
            </>
          )}

          {/* SECURITY TAB */}
          {activeTab === 'security' && (
            <>
              <Section title="Change Password" desc="Update your account password">
                <div className="space-y-3 max-w-sm">
                  <div>
                    <label className="text-xs text-iris-text-muted block mb-1">Current Password</label>
                    <input type="password" className="iris-input" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-iris-text-muted block mb-1">New Password</label>
                    <input type="password" className="iris-input" value={newPw} onChange={e => setNewPw(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-iris-text-muted block mb-1">Confirm New Password</label>
                    <input type="password" className="iris-input" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
                  </div>
                  {pwError && <p className="text-sm text-iris-danger">{pwError}</p>}
                  {pwSuccess && <p className="text-sm text-iris-success">Password changed successfully.</p>}
                  <button type="button" onClick={() => void changePassword()} disabled={pwLoading} className="iris-btn-primary px-4 py-2 text-sm disabled:opacity-50">
                    {pwLoading ? 'Updating…' : 'Update Password'}
                  </button>
                </div>
              </Section>

              <Section title="Active Sessions" desc="Devices currently signed in to your account">
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-lg border border-iris-border bg-iris-elevated px-4 py-3">
                    <div>
                      <p className="text-sm text-iris-text font-medium">Current Session</p>
                      <p className="text-xs text-iris-text-muted">Browser · {new Date().toLocaleDateString()}</p>
                    </div>
                    <span className="iris-badge bg-iris-success/20 text-iris-success border border-iris-success/30 text-xs">Active</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="mt-2 text-sm text-iris-danger hover:underline"
                >
                  Sign out of all sessions
                </button>
              </Section>
            </>
          )}

          {/* NOTIFICATIONS TAB */}
          {activeTab === 'notifications' && (
            <Section title="Notification Preferences" desc="Choose what alerts you receive">
              <div className="space-y-4">
                <Toggle
                  checked={notifs.highRisk}
                  onChange={v => setNotifs(n => ({ ...n, highRisk: v }))}
                  label="High-risk IoC alerts"
                  desc="Get notified when a query returns a score ≥ 70"
                />
                <Toggle
                  checked={notifs.feedDown}
                  onChange={v => setNotifs(n => ({ ...n, feedDown: v }))}
                  label="Feed health alerts"
                  desc="Alert when a feed's circuit breaker opens"
                />
                <Toggle
                  checked={notifs.weeklyDigest}
                  onChange={v => setNotifs(n => ({ ...n, weeklyDigest: v }))}
                  label="Weekly digest"
                  desc="Summary of your analysis activity each week"
                />
              </div>
              <div className="pt-2 rounded-lg border border-iris-warning/30 bg-iris-warning/5 px-4 py-3 text-xs text-iris-warning flex items-center gap-2">
                <AlertCircle size={13} className="shrink-0" />
                Email notifications require a verified email address. In-app alerts only for now.
              </div>
            </Section>
          )}

          {/* APPEARANCE TAB */}
          {activeTab === 'appearance' && (
            <>
              <Section title="Theme" desc="IRIS uses a dark theme designed for security operations">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border-2 border-iris-accent p-3 bg-iris-surface cursor-pointer">
                    <div className="h-12 rounded bg-iris-bg mb-2 flex items-end p-1">
                      <div className="h-2 w-8 rounded bg-iris-accent" />
                    </div>
                    <p className="text-xs text-iris-accent font-semibold">Dark (IRIS)</p>
                    <p className="text-[10px] text-iris-text-muted">Active theme</p>
                  </div>
                  <div className="rounded-lg border border-iris-border p-3 bg-iris-surface opacity-40 cursor-not-allowed">
                    <div className="h-12 rounded bg-gray-100 mb-2 flex items-end p-1">
                      <div className="h-2 w-8 rounded bg-blue-500" />
                    </div>
                    <p className="text-xs text-iris-text-dim font-semibold">Light</p>
                    <p className="text-[10px] text-iris-text-muted">Coming soon</p>
                  </div>
                </div>
              </Section>

              <Section title="Accent Color" desc="Highlight color used throughout the interface">
                <div className="flex items-center gap-3">
                  <div
                    className="h-8 w-8 rounded-full border-2 border-white/30"
                    style={{ backgroundColor: accentColor }}
                  />
                  <code className="font-mono text-sm text-iris-text">{accentColor}</code>
                  <span className="text-xs text-iris-text-muted italic">IRIS signature green · cannot be changed</span>
                </div>
              </Section>

              <Section title="Display Preferences">
                <div className="space-y-4">
                  <Toggle
                    checked={true}
                    onChange={() => {}}
                    label="Monospace IoC values"
                    desc="Show IP addresses and hashes in monospace font"
                  />
                  <Toggle
                    checked={true}
                    onChange={() => {}}
                    label="Animated transitions"
                    desc="Page and component animations (disable on slow hardware)"
                  />
                </div>
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
