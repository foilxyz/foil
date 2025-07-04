/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: [
        "./src/**/*.{js,ts,jsx,tsx,mdx}",
        "../../packages/ui/components/**/*.{js,ts,jsx,tsx}"
    ],
    presets: [require('@sapience/ui/tailwind-preset')],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Avenir Next Rounded', 'sans-serif'],
                heading: ['Avenir Next', 'sans-serif'],
            },
        }
    },
}

