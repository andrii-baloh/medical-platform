export type DocumentScanVerdict = "clean" | "infected" | "error";

export type DocumentScanInput = {
  documentId: string;
  bucket: string;
  storageKey: string;
  declaredMimeType: string;
  detectedMimeType: string;
  sha256Hex: string;
  sizeBytes: number;
};

export type DocumentScanResult = {
  verdict: DocumentScanVerdict;
  errorCode?: string;
};

export interface DocumentScannerProvider {
  readonly name: string;
  scan(input: DocumentScanInput): Promise<DocumentScanResult>;
}

export const DOCUMENT_SCANNER = Symbol("DOCUMENT_SCANNER");
