import { randomUUID, createHmac } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type {
  CreateRoomInput,
  CreateRoomResult,
  IssueTokenInput,
  IssueTokenResult,
  VideoProvider,
} from "./video.provider";

/**
 * Development-only VideoProvider.
 *
 * It does NOT carry real media. It issues signed, short-lived join tokens that
 * a future real provider (or a self-hosted SFU) will validate. This keeps the
 * domain contract complete while a country provider is still being chosen.
 *
 * Never expose this in production: real media, recording and e2ee policies must
 * come from the selected provider.
 */
@Injectable()
export class LocalDevVideoProvider implements VideoProvider {
  readonly name = "local-dev";
  private readonly secret = process.env.VIDEO_DEV_SECRET ?? "local-dev-video-secret";
  private readonly baseUrl = process.env.VIDEO_DEV_BASE_URL ?? "http://localhost:4000/v1/video/dev-room";

  async createRoom(input: CreateRoomInput): Promise<CreateRoomResult> {
    return {
      providerRoomId: `dev-${randomUUID()}`,
      metadata: { appointmentId: input.appointmentId, roomName: input.roomName, provider: this.name },
    };
  }

  async issueToken(input: IssueTokenInput): Promise<IssueTokenResult> {
    const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000);
    const payload = [input.providerRoomId, input.role, input.participantId, expiresAt.getTime()].join(".");
    const signature = createHmac("sha256", this.secret).update(payload).digest("base64url");
    const token = Buffer.from(payload).toString("base64url") + "." + signature;
    return {
      token,
      roomUrl: `${this.baseUrl}/${encodeURIComponent(input.providerRoomId)}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async closeRoom(): Promise<void> {
    // Nothing to tear down for the dev provider.
  }
}
