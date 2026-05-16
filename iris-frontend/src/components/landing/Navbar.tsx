import { useEffect, useMemo, useState } from 'react';
import { motion, useMotionValueEvent, useScroll } from 'framer-motion';
import { Eye } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import LoginModal from '../auth/LoginModal';
import RegisterModal from '../auth/RegisterModal';
import Modal from '../common/Modal';
import { useAuth } from '../../hooks/useAuth';

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
  const { isAuthenticated, user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);

  const reason = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('reason');
  }, [location.search]);

  const [showSessionBanner, setShowSessionBanner] = useState(false);

  useEffect(() => {
    if (reason === 'session-expired') {
      setShowSessionBanner(true);
      // Help the user recover immediately.
      openModal('login');
    }
  }, [reason, openModal]);

  useMotionValueEvent(scrollY, 'change', (latest) => {
    setScrolled(latest > 20);
  });

  return (
    <>
      {showSessionBanner && (
        <div className="fixed top-0 left-0 right-0 z-[60]">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
            <div className="flex-1 rounded-md border border-iris-border bg-iris-panel/90 px-4 py-2 text-sm text-iris-text">
              <span className="font-semibold text-iris-accent">Session expired.</span>{' '}
              Please log in again to continue.
            </div>
            <button
              className="iris-btn-secondary px-3 py-2 text-sm"
              onClick={() => {
                setShowSessionBanner(false);
                const params = new URLSearchParams(location.search);
                params.delete('reason');
                navigate(
                  { pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : '' },
                  { replace: true }
                );
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
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
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              <span className="hidden sm:inline text-sm text-iris-text-dim">
                {user?.email}
              </span>
              <button
                onClick={() => navigate('/dashboard')}
                className="iris-btn-secondary px-4 py-2 text-sm"
              >
                Dashboard
              </button>
              <button
                onClick={logout}
                className="iris-btn-secondary px-4 py-2 text-sm"
              >
                Logout
              </button>
            </>
          ) : (
            <button
              onClick={() => openModal('login')}
              className="iris-btn-secondary px-4 py-2 text-sm"
            >
              Get started
            </button>
          )}
        </div>
      </motion.nav>

      <Modal isOpen={isModalOpen && !isAuthenticated} onClose={closeModal}>
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
