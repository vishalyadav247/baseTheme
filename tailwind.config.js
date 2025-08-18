/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './layout/**/*.liquid',
    './templates/**/*.{liquid,json}',
    './sections/**/*.liquid',
    './snippets/**/*.liquid',
    './blocks/**/*.liquid',
    './assets/**/*.js'
  ],
  theme: { extend: {} },
  plugins: [],
  safelist: [
    'text-left', 'text-center', 'text-right',
    'md:text-left', 'md:text-center', 'md:text-right'
  ],
}

