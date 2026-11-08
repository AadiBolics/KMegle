import type { ReactNode } from "react";
export const metadata = {
  robots: { index: false, follow: false },
  title: "Account | KMegle",
  alternates: { canonical: "/settings" },
};
export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
