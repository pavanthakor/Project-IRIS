import IoCInput from '../IoCInput';

export default function HeroSection() {
  return (
    <section className="relative flex flex-col items-center justify-center min-h-screen pt-24 text-center bg-grid-pattern">
      <div className="absolute inset-0 bg-gradient-to-b from-iris-base via-iris-base to-transparent bg-opacity-90"></div>
      <div className="z-10 flex flex-col items-center px-4">
        <div className="inline-block px-3 py-1 mb-4 text-xs font-semibold tracking-wider uppercase rounded-full bg-iris-accent/10 text-iris-accent">
          Open Source Threat Intelligence
        </div>
        <h1 className="text-5xl font-bold tracking-tight md:text-7xl text-iris-text">
          Unified Threat Intel <br /> at{' '}
          <span className="text-iris-accent">Hyperspeed</span>
        </h1>
        <p className="max-w-2xl mx-auto mt-6 text-lg text-iris-text-dim">
          IRIS is an open-source Threat Intelligence Platform that aggregates,
          enriches, and correlates indicators of compromise from dozens of feeds
          into a single, unified interface.
        </p>
        <div className="w-full max-w-2xl mx-auto mt-10">
          <p className="mb-3 text-sm font-semibold text-iris-text">
            Try it live. No account required.
          </p>
          <IoCInput isLiveDemo={true} />
        </div>
      </div>
    </section>
  );
}
