/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Telegram dark theme colors
        tg: {
          bg: 'var(--tg-theme-bg-color, #1a1a2e)',
          secondary: 'var(--tg-theme-secondary-bg-color, #16213e)',
          text: 'var(--tg-theme-text-color, #ffffff)',
          hint: 'var(--tg-theme-hint-color, #7a7a7a)',
          link: 'var(--tg-theme-link-color, #6c63ff)',
          button: 'var(--tg-theme-button-color, #6c63ff)',
          buttonText: 'var(--tg-theme-button-text-color, #ffffff)',
        },
        // Custom brand colors
        brand: {
          purple: '#6c63ff',
          pink: '#ff6b9d',
          blue: '#4facfe',
          cyan: '#00f2fe',
          dark: '#0f0f23',
          darker: '#0a0a1a',
        }
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #6c63ff 0%, #ff6b9d 100%)',
        'gradient-blue': 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        'gradient-dark': 'linear-gradient(180deg, #1a1a2e 0%, #0f0f23 100%)',
        'gradient-card': 'linear-gradient(135deg, rgba(108, 99, 255, 0.1) 0%, rgba(255, 107, 157, 0.1) 100%)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 3s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 20px rgba(108, 99, 255, 0.3)' },
          '100%': { boxShadow: '0 0 30px rgba(108, 99, 255, 0.6)' },
        }
      }
    },
  },
  plugins: [],
}
