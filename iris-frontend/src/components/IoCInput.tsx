import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import type { IoCType } from '../types';
import { IOC_PATTERNS } from '../utils/constants';

interface IoCInputProps {
  isLiveDemo?: boolean;
}

export default function IoCInput({ isLiveDemo = false }: IoCInputProps) {
  const [ioc, setIoc] = useState('');
  const navigate = useNavigate();

  const inferType = (value: string): IoCType => {
    if (IOC_PATTERNS.ip.test(value)) return 'ip';
    if (IOC_PATTERNS.email.test(value)) return 'email';
    if (IOC_PATTERNS.hash.test(value)) return 'hash';
    if (IOC_PATTERNS.domain.test(value)) return 'domain';
    return 'domain';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = ioc.trim();
    if (!normalized) return;

    const params = new URLSearchParams({
      ioc: normalized,
      type: inferType(normalized),
    });

    navigate(`/dashboard?${params.toString()}`);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="relative"
    >
      <div className="relative">
        <input
          type="text"
          placeholder={
            isLiveDemo
              ? 'Try: 8.8.8.8, evil.example.com, or user@domain.com'
              : 'Enter IP, domain, hash, or URL...'
          }
          value={ioc}
          onChange={(e) => setIoc(e.target.value)}
          className="w-full py-4 pl-5 pr-28 text-base rounded-full shadow-lg bg-iris-base-light border border-iris-border focus:ring-2 focus:ring-iris-accent focus:outline-none transition-shadow"
        />
        <button
          type="submit"
          title="Analyze indicator"
          className="absolute inset-y-0 right-0 flex items-center justify-center w-24 text-white rounded-full bg-iris-accent hover:bg-iris-accent/90 disabled:bg-iris-accent/50 transition-colors"
        >
          <Search size={20} />
        </button>
      </div>
    </form>
  );
}