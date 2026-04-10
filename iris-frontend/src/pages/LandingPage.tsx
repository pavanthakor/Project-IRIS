import { useState } from 'react';
import CTASection from '../components/landing/CTASection';
import FeaturesSection from '../components/landing/FeaturesSection';
import Footer from '../components/landing/Footer';
import HeroSection from '../components/landing/HeroSection';
import HowItWorksSection from '../components/landing/HowItWorksSection';
import Navbar from '../components/landing/Navbar';
import StatsSection from '../components/landing/StatsSection';
import TrustedSources from '../components/landing/TrustedSources';

export default function LandingPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalView, setModalView] = useState<'login' | 'register'>('login');

  const openModal = (view: 'login' | 'register' = 'login') => {
    setModalView(view);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const switchView = (view: 'login' | 'register') => {
    setModalView(view);
  };

  return (
    <div className="bg-iris-base text-iris-text font-sans">
      <Navbar
        isModalOpen={isModalOpen}
        modalView={modalView}
        openModal={openModal}
        closeModal={closeModal}
        switchView={switchView}
      />
      <main className="overflow-x-hidden">
        <HeroSection />
        <TrustedSources />
        <FeaturesSection />
        <HowItWorksSection />
        <StatsSection />
        <CTASection openModal={openModal} />
      </main>
      <Footer />
    </div>
  );
}
