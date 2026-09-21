export interface ChatMessage {
  sender: "me" | "stranger" | "system";
  text: string;
}
