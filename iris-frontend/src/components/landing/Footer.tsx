import { Eye, ExternalLink } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-iris-base-light border-t border-iris-border">
      <div className="container mx-auto px-6 py-8">
        <div className="flex flex-col items-center justify-between md:flex-row">
          <div className="flex items-center gap-2">
            <Eye className="text-iris-accent" size={24} />
            <span className="font-mono text-xl font-bold tracking-widest text-iris-text">
              IRIS
            </span>
          </div>
          <p className="mt-4 text-sm text-iris-text-dim md:mt-0">
            © {new Date().getFullYear()} IRIS Project. All rights reserved.
          </p>
          <div className="flex items-center mt-4 md:mt-0">
            <a
              href="https://github.com/your-github/threat-intel-platform"
              target="_blank"
              rel="noopener noreferrer"
              className="text-iris-text-dim hover:text-iris-text transition-colors"
              aria-label="GitHub Repository"
            >
              <ExternalLink size={24} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
