import { browserApi } from "@/lib/api";

// Keep error response bodies out of patient-facing messages.
export async function patientRequest<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await browserApi<T>(path, init);
  } catch (error) {
    const status = (error as { status?: number } | null)?.status;
    if (status === 401) window.location.assign("/login");
    throw Object.assign(new Error("Не удалось выполнить запрос. Попробуйте ещё раз."), { status });
  }
}
