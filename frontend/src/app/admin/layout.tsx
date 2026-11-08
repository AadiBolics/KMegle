import type { ReactNode } from "react";
export const metadata = {
  robots: { index: false, follow: false },
  title: "Moderation | KMegle",
  alternates: { canonical: "/admin" },
};
export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
