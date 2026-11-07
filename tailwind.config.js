/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
    theme: {
      extend: {
        fontFamily: {
          bn: ['"Hind Siliguri"', 'system-ui', 'sans-serif']
        },
        colors: {
          brand: {
            DEFAULT: '#1A365D',
            light: '#2C5282',
            green: '#2F855A',
            accent: '#DD6B20'
          }
        }
      }
    },
    plugins: []
  }