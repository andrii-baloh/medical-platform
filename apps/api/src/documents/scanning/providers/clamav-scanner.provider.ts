import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Injectable } from "@nestjs/common";
import { once } from "node:events";
import { Socket, createConnection } from "node:net";
import type { DocumentScannerProvider, DocumentScanInput, DocumentScanResult } from "../document-scanner.provider";

@Injectable()
export class ClamAvScannerProvider implements DocumentScannerProvider {
  readonly name = "clamav";
  private readonly host = process.env.CLAMAV_HOST ?? "127.0.0.1";
  private readonly port = Number(process.env.CLAMAV_PORT ?? 3310);
  private readonly timeoutMs = Number(process.env.CLAMAV_SCAN_TIMEOUT_MS ?? 90000);
  private readonly maxStreamBytes = Number(process.env.CLAMAV_MAX_STREAM_BYTES ?? 26214400);
  private readonly s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION ?? "local",
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "false") === "true",
    credentials: process.env.S3_ACCESS_KEY ? {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    } : undefined,
  });

  async scan(input: DocumentScanInput): Promise<DocumentScanResult> {
    if (!input.bucket) return { verdict: "error", errorCode: "scanner_bucket_missing" };
    if (input.sizeBytes > this.maxStreamBytes) return { verdict: "error", errorCode: "scanner_stream_limit" };

    const object = await this.s3.send(new GetObjectCommand({
      Bucket: input.bucket,
      Key: input.storageKey,
    }));
    if (!object.Body) return { verdict: "error", errorCode: "scanner_object_body_missing" };

    try {
      return await this.scanStream(object.Body as AsyncIterable<Uint8Array>);
    } catch {
      return { verdict: "error", errorCode: "scanner_transport_error" };
    }
  }

  private scanStream(body: AsyncIterable<Uint8Array>): Promise<DocumentScanResult> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({ host: this.host, port: this.port });
      let reply = "";
      let settled = false;

      const finish = (result: DocumentScanResult) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(result);
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        reject(error);
      };

      socket.setTimeout(this.timeoutMs);
      socket.once("timeout", () => fail(new Error("clamav_timeout")));
      socket.once("error", fail);
      socket.on("data", (chunk) => {
        reply += chunk.toString("utf8");
        if (reply.includes("\0") || reply.includes("\n")) finish(parseClamAvReply(reply));
      });
      socket.once("end", () => {
        if (!settled) finish(parseClamAvReply(reply));
      });

      socket.once("connect", () => {
        void (async () => {
          try {
            await writeWithBackpressure(socket, Buffer.from("zINSTREAM\0", "utf8"));
            let total = 0;
            for await (const rawChunk of body) {
              const chunk = Buffer.from(rawChunk);
              total += chunk.length;
              if (total > this.maxStreamBytes) throw new Error("clamav_stream_limit");

              const length = Buffer.allocUnsafe(4);
              length.writeUInt32BE(chunk.length, 0);
              await writeWithBackpressure(socket, length);
              await writeWithBackpressure(socket, chunk);
            }
            await writeWithBackpressure(socket, Buffer.alloc(4));
          } catch (error) {
            fail(error instanceof Error ? error : new Error("clamav_stream_error"));
          }
        })();
      });
    });
  }
}

async function writeWithBackpressure(socket: Socket, data: Uint8Array): Promise<void> {
  if (socket.destroyed) throw new Error("clamav_socket_closed");
  if (!socket.write(data)) await once(socket, "drain");
}

function parseClamAvReply(raw: string): DocumentScanResult {
  const reply = raw.replaceAll("\0", "").trim();
  if (!reply) return { verdict: "error", errorCode: "scanner_empty_reply" };
  if (/\bOK$/i.test(reply)) return { verdict: "clean" };
  if (/\bFOUND$/i.test(reply)) return { verdict: "infected" };
  if (/size limit exceeded/i.test(reply)) return { verdict: "error", errorCode: "scanner_stream_limit" };
  return { verdict: "error", errorCode: "scanner_protocol_error" };
}
