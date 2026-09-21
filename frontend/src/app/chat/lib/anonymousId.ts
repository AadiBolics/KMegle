export function getAnonymousId(): string {
  if (typeof window === "undefined") return "anon_server";

  let userId = sessionStorage.getItem("kmegle_user_id");

  if (!userId) {
    const uuid = crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2, 15);

    userId = "anon_" + uuid;
    sessionStorage.setItem("kmegle_user_id", userId);
  }

  return userId;
}
