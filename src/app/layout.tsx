import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Press_Start_2P } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const pressStart = Press_Start_2P({
  variable: "--font-press-start",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rival Run · Beat your shadow at Lavaredo",
  description:
    "Sign in with Garmin Connect, meet the Shadow that makes your usual mistakes, and race Lavaredo Ultra Trail 120K with Marmo, a live AI trail coach.",
};

export const viewport: Viewport = {
  themeColor: "#121a33",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} ${pressStart.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        <Toaster theme="dark" position="top-center" richColors />
      </body>
    </html>
  );
}
