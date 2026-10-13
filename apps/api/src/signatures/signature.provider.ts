export type SignatureRequest = { documentHash: string; signingTime: Date; signer: { userId: string; doctorId: string; fullName: string } };
export type SignatureResult = { signature: string; certificateInfo: Record<string, unknown>; status: "valid"|"invalid"|"pending_verification"; qualificationStatus: "qualified"|"not_qualified"|"unverified"; provider: string };
export interface SignatureProvider { readonly name: string; sign(request: SignatureRequest): Promise<SignatureResult>; }
export const SIGNATURE_PROVIDER = Symbol("SIGNATURE_PROVIDER");
