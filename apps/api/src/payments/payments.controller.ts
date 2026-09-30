import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { Principal } from "../auth/principal";
import { Public } from "../auth/public.decorator";
import { RefundRequestDto } from "./payment.dto";
import { PaymentsService } from "./payments.service";

@Controller("payments")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post("appointments/:appointmentId/session")
  createSession(@CurrentPrincipal() principal: Principal, @Param("appointmentId") appointmentId: string) {
    return this.payments.createSession(principal, appointmentId);
  }

  @Get("appointments/:appointmentId")
  listForAppointment(@CurrentPrincipal() principal: Principal, @Param("appointmentId") appointmentId: string) {
    return this.payments.getForAppointment(principal, appointmentId);
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
}
