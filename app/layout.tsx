import type { Metadata } from "next";
import { Fira_Code } from "next/font/google";
import "./globals.css";

const fira = Fira_Code({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "Simple Socket.io Chat",
    description: "Simple Socket.io Chat",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
        <body className={fira.className}>{children}</body>
        </html>
    );
}
