import { motion } from 'framer-motion';
import { AtSign, Fingerprint, Globe2, Radar } from 'lucide-react';

const SUPPORTED_TYPES = [
  { label: 'IP', icon: Radar },
  { label: 'Domain', icon: Globe2 },
  { label: 'Hash', icon: Fingerprint },
  { label: 'Email', icon: AtSign },
] as const;

export default function EmptyState() {
  return (
    <div className="iris-card flex min-h-[460px] flex-col items-center justify-center px-6 py-10 text-center">
      <motion.div
        animate={{
          scale: [1, 1.05, 1],
          rotate: [0, 2.5, 0, -2.5, 0],
          opacity: [0.85, 1, 0.85],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        className="mb-6 rounded-full border border-iris-border bg-iris-surface p-6"
      >
        <Radar size={64} className="text-iris-accent" />
      </motion.div>

      <h1 className="max-w-2xl text-balance text-2xl font-semibold text-iris-text md:text-3xl">
        Enter an Indicator of Compromise to begin analysis
      </h1>
      <p className="mt-3 max-w-3xl text-sm text-iris-text-dim md:text-base">
        Supported: IPv4 addresses, domains, file hashes (MD5/SHA1/SHA256), email addresses
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SUPPORTED_TYPES.map(({ label, icon: Icon }) => (
          <div
            key={label}
            className="iris-card-elevated flex items-center gap-2 px-3 py-2 text-xs text-iris-text-dim"
          >
            <Icon size={14} className="text-iris-accent" />
            <span className="font-medium tracking-wide">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
