import type { Metadata } from "next";
import { AuthProvider } from "../context/authContext";
import { ThemeProvider } from "../context/themeContext";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://kmegle.aadinadhan.me"),
  title: "KMegle | A little more campus.",
  description:
    "Meet fellow adult IIIT Kottayam students through video and text. Verified Google sign-in required.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "KMegle",
    title: "KMegle | A little more campus.",
    description:
      "A familiar place. A fresh hello. Video and text for adult IIIT Kottayam students.",
  },
  twitter: { card: "summary_large_image" },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-32.png", sizes: "32x32" },
      { url: "/icons/icon-192.png", sizes: "192x192" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          id="theme-init"
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('kmegle_theme');document.documentElement.classList.toggle('dark',t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches));}catch(e){}",
          }}
        />
        <meta name="theme-color" content="#0a0a0f" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "KMegle",
              url: "https://kmegle.aadinadhan.me",
              description:
                "Video and text for adult IIIT Kottayam students. Verified Google sign-in required.",
              applicationCategory: "SocialNetworkingApplication",
              operatingSystem: "Web",
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "USD",
              },
            }),
          }}
        />
      </head>
      <body className={inter.className}>
        <AuthProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
