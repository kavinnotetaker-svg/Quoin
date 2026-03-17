import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { TRPCProvider } from "@/components/providers";
import "./globals.css";
import { Inter, JetBrains_Mono } from "next/font/google";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

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
      <html lang="en" className={cn("light font-sans antialiased", inter.variable, jetbrainsMono.variable)} style={{ colorScheme: 'light' }}>
        <body className="min-h-screen bg-background text-foreground">
          <TRPCProvider>{children}</TRPCProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
