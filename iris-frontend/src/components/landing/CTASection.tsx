interface CTASectionProps {
  openModal: (view: 'login' | 'register') => void;
}

export default function CTASection({ openModal }: CTASectionProps) {
  return (
    <section className="py-24 bg-iris-accent/5">
      <div className="container mx-auto px-4 text-center">
        <h2 className="text-4xl font-bold tracking-tight text-iris-text">
          Ready to Get Started?
        </h2>
        <p className="max-w-2xl mx-auto mt-4 text-lg text-iris-text-dim">
          Create a free account to get full API access, save your query history,
          and set up webhook notifications.
        </p>
        <div className="mt-8">
          <button
            className="iris-btn-primary px-8 py-3 text-lg"
            onClick={() => openModal('register')}
          >
            Create Your Free Account
          </button>
        </div>
      </div>
    </section>
  );
}
