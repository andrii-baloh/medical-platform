import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { SignatureProvider, SignatureRequest, SignatureResult } from "../signature.provider";
@Injectable()
export class DevelopmentSignatureProvider implements SignatureProvider {
  readonly name = "development";
  async sign(request: SignatureRequest): Promise<SignatureResult> {
    const signature = createHash("sha256").update(`development-not-qualified:${request.documentHash}:${request.signingTime.toISOString()}`).digest("base64");
    return { signature, certificateInfo: { kind:"development", warning:"NOT A QUALIFIED ELECTRONIC SIGNATURE", signerDoctorId:request.signer.doctorId }, status:"pending_verification", qualificationStatus:"not_qualified", provider:this.name };
  }
}
