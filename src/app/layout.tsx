import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { TRPCProvider } from "@/components/providers";
import "./globals.css";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import { cn } from "@/lib/utils";

// Display / headline font: Space Grotesk
// — Geometric precision, wider aperture, suggests engineering / blueprint authority
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

// Body / UI font: Inter
// — Maximum legibility at small sizes, neutral workhorse for data density
const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

// Mono / data font: JetBrains Mono
// — Compliance IDs, rule codes, tabular numeric data
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Quoin — DC BEPS Compliance Platform",
  description:
    "Automated Washington DC Building Energy Performance Standards compliance",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={cn(
          "light font-sans antialiased",
          spaceGrotesk.variable,
          inter.variable,
          jetbrainsMono.variable,
        )}
        style={{ colorScheme: "light" }}
      >
        <body className="min-h-screen bg-background text-foreground">
          <TRPCProvider>{children}</TRPCProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
