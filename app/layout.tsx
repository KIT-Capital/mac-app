import type { Metadata } from "next";
import { Cormorant_Garamond, Geist } from "next/font/google";
import { AppFrame } from "@/components/app-frame";
import { StoreProvider } from "@/lib/store";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const display = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Mechanical Art Capital",
  description:
    "Confidential appraisals and sale-and-repurchase financing for high-end timepieces.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${display.variable} dark h-full antialiased`}
    >
      <body className="min-h-full bg-black font-sans text-white">
        <StoreProvider>
          <AppFrame>{children}</AppFrame>
        </StoreProvider>
      </body>
    </html>
  );
}
