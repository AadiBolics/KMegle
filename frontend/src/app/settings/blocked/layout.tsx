import type { ReactNode } from "react";
export const metadata = {
  title: "Blocked students | KMegle",
  robots: { index: false, follow: false },
  alternates: { canonical: "/settings/blocked" },
};
export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
