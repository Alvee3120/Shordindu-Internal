import type { Metadata } from "next";
import Script from "next/script";
import { Inter } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Shordindu",
  description: "Internal daily updates, assignments, and team collaboration",
};

const themeScript = `(function(){try{var stored=localStorage.getItem("theme");var dark=stored==="dark"||(stored===null&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",dark);}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Script id="theme-init" strategy="beforeInteractive">
          {themeScript}
        </Script>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
