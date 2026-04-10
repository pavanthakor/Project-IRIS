import { useState } from 'react';
import { motion, useMotionValueEvent, useScroll } from 'framer-motion';
import { Eye } from 'lucide-react';
import LoginModal from '../auth/LoginModal';
import RegisterModal from '../auth/RegisterModal';
import Modal from '../common/Modal';

interface NavbarProps {
  isModalOpen: boolean;
  modalView: 'login' | 'register';
  openModal: (view: 'login' | 'register') => void;
  closeModal: () => void;
  switchView: (view: 'login' | 'register') => void;
}

export default function Navbar({
  isModalOpen,
  modalView,
  openModal,
  closeModal,
  switchView,
}: NavbarProps) {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);

  useMotionValueEvent(scrollY, 'change', (latest) => {
    setScrolled(latest > 20);
  });

  return (
    <>
      <motion.nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3 transition-all duration-300"
        initial={false}
        animate={{
          backgroundColor: scrolled ? 'rgba(10, 14, 20, 0.8)' : 'transparent',
          boxShadow: scrolled ? '0 4px 30px rgba(0, 0, 0, 0.1)' : 'none',
          borderBottomWidth: scrolled ? '1px' : '0px',
          borderColor: scrolled ? 'rgba(36, 48, 66, 1)' : 'transparent',
        }}
        style={{
          backdropFilter: scrolled ? 'blur(12px)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(12px)' : 'none',
        }}
      >
        <div className="flex items-center gap-2">
          <Eye className="text-iris-accent" size={28} />
          <span className="font-mono text-2xl font-bold tracking-widest text-iris-text">
            IRIS
          </span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-iris-text-dim">
          <a href="#features" className="hover:text-iris-text transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-iris-text transition-colors">How it works</a>
          <a href="#feeds" className="hover:text-iris-text transition-colors">Feeds</a>
          <a href="/api-docs" target="_blank" rel="noopener noreferrer" className="hover:text-iris-text transition-colors">API Docs</a>
        </div>
        <div>
          <button
            onClick={() => openModal('login')}
            className="iris-btn-secondary px-4 py-2 text-sm"
          >
            Get started
          </button>
        </div>
      </motion.nav>

      <Modal isOpen={isModalOpen} onClose={closeModal}>
        <div className="w-full max-w-md">
          <div className="flex mb-4 border-b border-iris-border">
            <button
              onClick={() => switchView('login')}
              className={`flex-1 px-4 py-3 text-sm font-semibold text-center transition-all duration-200 focus:outline-none ${
                modalView === 'login'
                  ? 'text-iris-accent border-b-2 border-iris-accent'
                  : 'text-iris-text-dim hover:text-iris-text'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => switchView('register')}
              className={`flex-1 px-4 py-3 text-sm font-semibold text-center transition-all duration-200 focus:outline-none ${
                modalView === 'register'
                  ? 'text-iris-accent border-b-2 border-iris-accent'
                  : 'text-iris-text-dim hover:text-iris-text'
              }`}
            >
              Create Account
            </button>
          </div>
          <div className="px-6 pb-6">
            {modalView === 'login' ? <LoginModal /> : <RegisterModal />}
          </div>
        </div>
      </Modal>
    </>
  );
}
