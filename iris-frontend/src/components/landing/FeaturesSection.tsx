import {
  ShieldCheck,
  Zap,
  Share2,
  BarChart3,
  Webhook,
  FileDown,
} from 'lucide-react';

const features = [
  {
    icon: <Zap size={28} className="text-iris-accent" />,
    title: 'Rapid Enrichment',
    description:
      'Submit an indicator and IRIS queries dozens of threat intelligence feeds in parallel, giving you comprehensive results in seconds.',
  },
  {
    icon: <ShieldCheck size={28} className="text-iris-accent" />,
    title: 'Risk Scoring',
    description:
      'Indicators are automatically assigned a risk score based on detection ratios and feed reputation, allowing you to prioritize threats.',
  },
  {
    icon: <Share2 size={28} className="text-iris-accent" />,
    title: 'MITRE ATT&CK Mapping',
    description:
      'Identified threats are mapped to the MITRE ATT&CK framework, providing context on adversary tactics, techniques, and procedures.',
  },
  {
    icon: <BarChart3 size={28} className="text-iris-accent" />,
    title: 'Historical Analysis',
    description:
      'All queries are saved, allowing you to track indicator reputation over time and identify recurring threats in your environment.',
  },
  {
    icon: <Webhook size={28} className="text-iris-accent" />,
    title: 'Webhook & API Support',
    description:
      'Integrate IRIS into your existing security workflows with a full-featured REST API and webhook notifications for new threats.',
  },
  {
    icon: <FileDown size={28} className="text-iris-accent" />,
    title: 'Exportable Reports',
    description:
      'Easily export threat profiles to CSV or JSON for sharing with your team or ingesting into other security tools.',
  },
];

export default function FeaturesSection() {
  return (
    <section id="features" className="py-24 bg-iris-base">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-4xl font-bold tracking-tight text-iris-text">
            Everything you need to supercharge your threat analysis.
          </h2>
          <p className="mt-4 text-lg text-iris-text-dim">
            IRIS provides a powerful suite of tools to help you quickly
            understand and respond to threats, all from a single platform.
          </p>
        </div>

        <div className="grid gap-8 mt-16 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="p-8 transition-all duration-300 bg-iris-base-light rounded-xl border border-iris-border hover:border-iris-accent/50 hover:bg-iris-base-light/50"
            >
              <div className="flex items-center justify-center w-12 h-12 mb-6 rounded-full bg-iris-accent/10">
                {feature.icon}
              </div>
              <h3 className="text-xl font-semibold text-iris-text">
                {feature.title}
              </h3>
              <p className="mt-2 text-iris-text-dim">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
