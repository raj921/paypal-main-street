import type { Metadata } from "next";
import { IBM_Plex_Mono, Pixelify_Sans, Work_Sans } from "next/font/google";
import "./globals.css";

const pixel = Pixelify_Sans({ variable: "--font-pixelify", subsets: ["latin"] });
const sans = Work_Sans({ variable: "--font-sans-body", subsets: ["latin"] });
const mono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Main Street",
  description: "Your PayPal account as a pixel town, run by AI staff.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${pixel.variable} ${sans.variable} ${mono.variable} antialiased`}>{children}</body>
    </html>
  );
}
