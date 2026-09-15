import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { AppFrame } from "@/components/app-frame";
import { SITE_URL } from "@/lib/site";
import { StoreProvider } from "@/lib/store";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Mechanical Art Capital",
  description:
    "Confidential appraisals and sale-and-repurchase of high-end timepieces. Not a loan.",
  applicationName: "MAC",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.png",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MAC",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: "#0E2A44",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geist.variable} dark h-full antialiased`}
    >
      <body className="min-h-full bg-[#0b0f16] font-sans text-white">
        <StoreProvider>
          <AppFrame>{children}</AppFrame>
        </StoreProvider>
      </body>
    </html>
  );
}
