const stats = [
  { value: '50+', label: 'Threat Feeds' },
  { value: '10k+', label: 'Indicators Processed Daily' },
  { value: '100%', label: 'Open Source' },
  { value: '<5s', label: 'Average Query Time' },
];

export default function StatsSection() {
  return (
    <section className="py-20 bg-iris-base">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 gap-8 text-center md:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label}>
              <p className="text-4xl font-bold tracking-tight text-iris-accent md:text-5xl">
                {stat.value}
              </p>
              <p className="mt-2 text-sm font-semibold tracking-wider uppercase text-iris-text-dim">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
