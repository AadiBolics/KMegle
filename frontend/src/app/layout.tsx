import type { Metadata } from "next";
import { AuthProvider } from "../context/authContext";
import { ThemeProvider } from "../context/themeContext";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });

export const metadata: Metadata = {
  title: "KMegle – Free Random Video Chat | Talk to Strangers Instantly",
  description:
    "KMegle is a free, anonymous random video chat app. Talk to strangers instantly with no sign-up required. The best Omegle alternative for meeting new people via live video chat.",
  keywords: [
    "random video chat",
    "omegle alternative",
    "omegle",
    "talk to strangers",
    "random chat",
    "video chat with strangers",
    "anonymous chat",
    "free video chat",
    "stranger chat",
    "live chat",
    "chat roulette",
    "chatroulette alternative",
    "umingle",
    "emerald chat",
    "chatspin",
    "random chat app",
    "video chat app",
    "meet strangers online",
    "anonymous video chat",
    "no signup chat",
    "KMegle",
    "kmegle",
  ].join(", "),
  authors: [{ name: "KMegle" }],
  creator: "KMegle",
  publisher: "KMegle",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://kmegle.aadinadhan.me",
    siteName: "KMegle",
    title: "KMegle – Free Random Video Chat | Best Omegle Alternative",
    description:
      "Talk to strangers instantly with free anonymous video chat. No sign-up, no account needed. KMegle is the best Omegle alternative for random video chat.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "KMegle – Random Video Chat",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "KMegle – Free Random Video Chat | Best Omegle Alternative",
    description:
      "Talk to strangers instantly with free anonymous video chat. No sign-up needed. The best Omegle alternative.",
    images: ["/og-image.png"],
  },
  alternates: {
    canonical: "https://kmegle.aadinadhan.me",
  },
  // SVG for modern browsers, PNG fallbacks for Chrome Android / iOS Safari
  // (which ignore SVG tab icons), plus the iOS home-screen touch icon.
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
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
    <html lang="en">
      <head>
        <meta name="theme-color" content="#f7f2ea" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "KMegle",
              url: "https://kmegle.aadinadhan.me",
              description:
                "Free anonymous random video chat. Talk to strangers instantly with no sign-up required. The best Omegle alternative.",
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
      <body className={`${inter.className} ${fraunces.variable}`}>
  <AuthProvider>
    <ThemeProvider>
      {children}
    </ThemeProvider>
  </AuthProvider>
</body>
    </html>
  );
}
