/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // IRIS Military/Cyber Dark Theme
        iris: {
          bg: '#0a0e14', // deepest background
          surface: '#111820', // cards, panels
          elevated: '#1a2332', // elevated cards, hover states
          border: '#243042', // borders, dividers
          'border-light': '#2d3d52', // lighter borders on hover
          accent: '#c5f467', // primary accent — toxic green (like screenshots)
          'accent-dim': '#8fb33a', // dimmed accent
          danger: '#ef4444', // red for HIGH/CRITICAL
          warning: '#f59e0b', // amber for MEDIUM
          success: '#22c55e', // green for clean/operational
          info: '#3b82f6', // blue for informational
          text: '#e2e8f0', // primary text
          'text-dim': '#8896a8', // secondary text
          'text-muted': '#556479', // muted text
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'scan-line': 'scanLine 3s linear infinite',
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'score-fill': 'scoreFill 1.2s ease-out forwards',
      },
      keyframes: {
        scanLine: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scoreFill: {
          '0%': { strokeDashoffset: '314' },
        },
      },
    },
  },
  plugins: [],
};
