import type { ReactNode } from "react";
export const metadata = {
  title: "Sign in | KMegle",
  robots: { index: false, follow: false },
  alternates: { canonical: "/login" },
};
export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
