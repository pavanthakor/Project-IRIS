export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
      {/* Radar pulse animation */}
      <div className="relative w-24 h-24 mb-8">
        <div className="absolute inset-0 rounded-full border-2 border-blue-500/20 animate-ping" />
        <div className="absolute inset-2 rounded-full border-2 border-blue-500/30 animate-ping" style={{ animationDelay: '0.3s' }} />
        <div className="absolute inset-4 rounded-full border-2 border-blue-500/40 animate-ping" style={{ animationDelay: '0.6s' }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <svg className="w-10 h-10 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L3 6.5V12c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V6.5L12 2z"/>
          </svg>
        </div>
      </div>

      <h2 className="text-xl font-semibold text-slate-300 mb-2">
        Enter an Indicator of Compromise to begin analysis
      </h2>
      <p className="text-slate-500 text-sm mb-8 max-w-md">
        Query multiple threat intelligence feeds simultaneously and receive a
        correlated risk score, MITRE ATT&amp;CK mapping, and geo-location data.
      </p>

      <div className="flex flex-wrap justify-center gap-4">
        {[
          { icon: '🌐', label: 'IP Address', example: '8.8.8.8', color: 'text-sky-400' },
          { icon: '🔗', label: 'Domain', example: 'example.com', color: 'text-violet-400' },
          { icon: '#', label: 'File Hash', example: 'MD5 / SHA1 / SHA256', color: 'text-amber-400' },
          { icon: '✉', label: 'Email', example: 'user@domain.com', color: 'text-emerald-400' },
        ].map(({ icon, label, example, color }) => (
          <div
            key={label}
            className="flex flex-col items-center gap-1 bg-slate-800 border border-slate-700 rounded-xl px-6 py-4 w-36"
          >
            <span className={`text-2xl ${color}`}>{icon}</span>
            <span className="text-xs font-semibold text-slate-300">{label}</span>
            <span className="text-xs text-slate-600 font-mono text-center">{example}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default EmptyState;
