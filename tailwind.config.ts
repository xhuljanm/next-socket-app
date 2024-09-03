import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                "primary": "#121212",
                "secondary": "#191919",
                "primary-white": "#424242",
                "secondary-white": "#525252",
            }
        },
    },
    plugins: [
        require('tailwind-scrollbar')
    ],
};
export default config;
