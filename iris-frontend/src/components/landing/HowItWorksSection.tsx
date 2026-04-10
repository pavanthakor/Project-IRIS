import { Terminal, Database, GitBranch, ShieldAlert } from 'lucide-react';

const steps = [
  {
    icon: <Terminal size={32} className="text-iris-accent" />,
    title: '1. Submit Indicator',
    description:
      'Start by submitting an IoC (like an IP, domain, or file hash) through the UI or the REST API.',
  },
  {
    icon: <Database size={32} className="text-iris-accent" />,
    title: '2. Parallel Enrichment',
    description:
      'IRIS automatically queries multiple external threat feeds and internal data sources simultaneously.',
  },
  {
    icon: <GitBranch size={32} className="text-iris-accent" />,
    title: '3. Data Correlation',
    description:
      'The Correlation Engine links disparate data points, connecting indicators to known threats and campaigns.',
  },
  {
    icon: <ShieldAlert size={32} className="text-iris-accent" />,
    title: '4. Unified Profile',
    description:
      'View a comprehensive threat profile with a calculated risk score, MITRE ATT&CK mapping, and all raw feed data.',
  },
];

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-24 bg-iris-base-light">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-4xl font-bold tracking-tight text-iris-text">
            A simple, powerful workflow.
          </h2>
          <p className="mt-4 text-lg text-iris-text-dim">
            From submission to a comprehensive threat profile in four simple steps.
          </p>
        </div>

        <div className="relative mt-16">
          <div className="absolute left-1/2 top-8 bottom-8 w-0.5 bg-iris-border -translate-x-1/2 hidden md:block"></div>
          <div className="grid gap-12 md:grid-cols-2">
            {steps.map((step, index) => (
              <div
                key={step.title}
                className={`flex flex-col items-center text-center md:flex-row md:text-left ${
                  index % 2 === 1 ? 'md:flex-row-reverse md:text-right' : ''
                }`}
              >
                <div className="relative z-10 flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-iris-base border-2 border-iris-accent md:mb-0">
                  {step.icon}
                </div>
                <div
                  className={`md:w-5/6 ${
                    index % 2 === 1 ? 'md:mr-10' : 'md:ml-10'
                  }`}
                >
                  <h3 className="text-2xl font-semibold text-iris-text">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-iris-text-dim">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
