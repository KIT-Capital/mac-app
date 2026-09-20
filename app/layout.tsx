import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { AppFrame } from "@/components/app-frame";
import { SITE_URL } from "@/lib/site";
import { StoreProvider } from "@/lib/store";
import { brandBootstrapScript, brandFromSettings } from "@/lib/theme";
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
  themeColor: brandFromSettings({}).palette.primary,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geist.variable} dark h-full antialiased`}
      data-brand="mac"
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: brandBootstrapScript() }} />
      </head>
      <body className="min-h-full bg-mac-bg font-sans text-white">
        <StoreProvider>
          <AppFrame>{children}</AppFrame>
        </StoreProvider>
      </body>
    </html>
  );
}
