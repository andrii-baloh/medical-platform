import { Body, Controller, Get, Header, Headers, Param, Post } from "@nestjs/common";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { Principal } from "../auth/principal";
import { Public } from "../auth/public.decorator";
import { FiscalReceiptsService } from "./fiscalization/fiscal-receipts.service";
import { RefundRequestDto } from "./payment.dto";
import { PaymentsService } from "./payments.service";

@Controller("payments")
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly fiscalReceipts: FiscalReceiptsService,
  ) {}

  @Post("appointments/:appointmentId/session")
  createSession(@CurrentPrincipal() principal: Principal, @Param("appointmentId") appointmentId: string) {
    return this.payments.createSession(principal, appointmentId);
  }

  @Get("appointments/:appointmentId")
  listForAppointment(@CurrentPrincipal() principal: Principal, @Param("appointmentId") appointmentId: string) {
    return this.payments.getForAppointment(principal, appointmentId);
  }

  @Get("appointments/:appointmentId/receipts")
  listReceipts(@CurrentPrincipal() principal: Principal, @Param("appointmentId") appointmentId: string) {
    return this.fiscalReceipts.listForAppointment(principal, appointmentId);
  }

  @Post(":paymentId/refunds")
  requestRefund(
    @CurrentPrincipal() principal: Principal,
    @Param("paymentId") paymentId: string,
    @Body() body: RefundRequestDto,
  ) {
    return this.payments.requestRefund(principal, paymentId, body.amountMinor, body.reasonCode);
  }

  @Public()
  @Post("webhooks/development")
  developmentWebhook(@Headers("x-payment-signature") signature: string | undefined, @Body() body: unknown) {
    return this.payments.processWebhook(signature, body);
  }

  @Public()
  @Post("webhooks/robokassa")
  @Header("Content-Type", "text/plain; charset=utf-8")
  async robokassaWebhook(@Body() body: unknown) {
    await this.payments.processWebhook(undefined, body);
    const values = body && typeof body === "object" && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
    const invoiceId =
      typeof values.InvId === "string" ? values.InvId :
      typeof values.InvoiceID === "string" ? values.InvoiceID :
      typeof values.InvId === "number" ? String(values.InvId) :
      typeof values.InvoiceID === "number" ? String(values.InvoiceID) : "";
    return `OK${invoiceId}`;
  }
}
