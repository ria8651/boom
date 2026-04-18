export interface ConnectionDetails {
  serverUrl: string;
  token: string;
  room: string;
  identity: string;
  inviteToken?: string; // present when joined as guest
  guestName?: string;   // stored for guest session restore
}
