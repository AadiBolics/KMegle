import ChatDashboard from "./components/chat/ChatDashboard";
import ConsentGate from "../../components/ConsentGate";
export const metadata = {
  title: "Campus chat | KMegle",
  robots: { index: false, follow: false },
  alternates: { canonical: "/chat" },
};

export default function ChatPage() {
  return (
    <ConsentGate>
      <ChatDashboard />
    </ConsentGate>
  );
}
