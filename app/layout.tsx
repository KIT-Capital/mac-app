import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { AppFrame } from "@/components/app-frame";
import { StoreProvider } from "@/lib/store";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mechanical Art Capital",
  description:
    "Confidential appraisals and sale-and-repurchase financing for high-end timepieces.",
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
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0E2A44",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geist.variable} dark h-full antialiased`}
    >
      <body className="min-h-full bg-[#5C6570] font-sans text-white">
        <StoreProvider>
          <AppFrame>{children}</AppFrame>
        </StoreProvider>
      </body>
    </html>
  );
}
