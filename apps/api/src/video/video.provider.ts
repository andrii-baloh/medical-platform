/**
 * Provider-neutral video abstraction.
 *
 * A country launch picks a concrete provider (or a self-hosted SFU) by
 * implementing this interface. Domain code must never import a vendor SDK
 * directly — only this interface.
 */
export type VideoParticipantRole = "patient" | "doctor";

export interface CreateRoomInput {
  /** Stable internal room name; contains no patient-identifying data. */
  roomName: string;
  /** Internal appointment id, for provider-side correlation only. */
  appointmentId: string;
}

export interface CreateRoomResult {
  providerRoomId: string;
  /** Extra provider-specific metadata worth persisting (region, url, etc). */
  metadata?: Record<string, unknown>;
}

export interface IssueTokenInput {
  providerRoomId: string;
  role: VideoParticipantRole;
  /** Stable internal identity of the joining account. */
  participantId: string;
  displayName: string;
  ttlSeconds: number;
}

export interface IssueTokenResult {
  token: string;
  /** Absolute URL the client should open/connect to. */
  roomUrl: string;
  expiresAt: string;
}

export interface VideoProvider {
  /** Human-readable provider key persisted in video_rooms.provider. */
  readonly name: string;
  createRoom(input: CreateRoomInput): Promise<CreateRoomResult>;
  issueToken(input: IssueTokenInput): Promise<IssueTokenResult>;
  closeRoom(providerRoomId: string): Promise<void>;
}

export const VIDEO_PROVIDER = Symbol("VIDEO_PROVIDER");
