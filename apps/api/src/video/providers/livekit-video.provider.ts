import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import type {
  CreateRoomInput,
  CreateRoomResult,
  IssueTokenInput,
  IssueTokenResult,
  VideoProvider,
} from "../video.provider";

/**
 * LiveKit adapter.
 *
 * This is the ONLY place in the API that imports the LiveKit SDK. Domain and
 * business services depend on the VideoProvider interface, never on LiveKit.
 *
 * The LiveKit API secret never leaves the API process: it is only used to sign
 * short-lived access tokens. Tokens are returned to the caller and are never
 * persisted by this application.
 */
@Injectable()
export class LiveKitVideoProvider implements VideoProvider {
  readonly name = "livekit";

  private readonly apiKey = process.env.LIVEKIT_API_KEY ?? "";
  private readonly apiSecret = process.env.LIVEKIT_API_SECRET ?? "";
  private readonly apiUrl = process.env.LIVEKIT_URL ?? "";
  private readonly publicUrl = process.env.LIVEKIT_PUBLIC_URL ?? process.env.LIVEKIT_URL ?? "";
  private readonly roomService: RoomServiceClient | null = null;

  constructor() {
    if (this.apiUrl && this.apiKey && this.apiSecret) {
      this.roomService = new RoomServiceClient(this.apiUrl.replace(/^ws/, "http"), this.apiKey, this.apiSecret);
    }
  }

  private assertConfigured() {
    if (!this.apiKey || !this.apiSecret || !this.apiUrl) {
      throw new ServiceUnavailableException("Video provider is not configured");
    }
  }

  async createRoom(input: CreateRoomInput): Promise<CreateRoomResult> {
    this.assertConfigured();
    // The room name is technical and contains no patient-identifying data.
    await this.roomService!.createRoom({ name: input.roomName, emptyTimeout: 10 * 60 });
    return { providerRoomId: input.roomName, metadata: { provider: this.name } };
  }

  async issueToken(input: IssueTokenInput): Promise<IssueTokenResult> {
    this.assertConfigured();
    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity: input.participantId,
      name: input.displayName,
      ttl: input.ttlSeconds,
    });
    at.addGrant({
      roomJoin: true,
      room: input.providerRoomId,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    const token = await at.toJwt();
    const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000);
    return { token, roomUrl: this.publicUrl, expiresAt: expiresAt.toISOString() };
  }

  async closeRoom(providerRoomId: string): Promise<void> {
    if (!this.roomService) return;
    try {
      await this.roomService.deleteRoom(providerRoomId);
    } catch {
      // A room that is already gone is not an error for our purposes.
    }
  }
}
