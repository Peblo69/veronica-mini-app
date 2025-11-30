/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // OnlyFans colors
        of: {
          blue: '#00AFF0',
          blueDark: '#0095D0',
          blueLight: '#E8F7FC',
          bg: '#FFFFFF',
          card: '#FFFFFF',
          text: '#000000',
          textSecondary: '#8A96A3',
          border: '#E5E5E5',
          success: '#00C853',
          error: '#FF3B30',
        }
      },
    },
  },
  plugins: [],
}
