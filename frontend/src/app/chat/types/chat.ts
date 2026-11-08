export interface ChatMessage {
  id?: string;
  sender: "me" | "stranger" | "system";
  text: string;
}

// What's currently happening with the connection, derived once from socket/room/stream
// state so every component agrees on it instead of each guessing from status text.
export type ConnectionPhase =
  | "idle"
  | "connecting"
  | "waiting"
  | "negotiating"
  | "live"
  | "ended";
