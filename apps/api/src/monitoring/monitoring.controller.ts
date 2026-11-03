import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CurrentPrincipal } from "../auth/current-principal.decorator";
import type { Principal } from "../auth/principal";
import {
  AlertStatusDto,
  CreateEnrollmentDto,
  CreateMeasurementDto,
  CreateProgramDto,
  CreateReviewDto,
  CreateThresholdDto,
} from "./monitoring.dto";
import { MonitoringService } from "./monitoring.service";

/**
 * Remote patient monitoring.
 *
 * Doctors configure programs and thresholds and manage their own patients;
 * patients can read their enrollments and submit measurements. Access is
 * resolved through the enrollment, never from a client-provided relationship.
 */
@Controller("monitoring")
export class MonitoringController {
  constructor(private readonly monitoring: MonitoringService) {}

  @Get("programs")
  listPrograms(@CurrentPrincipal() principal: Principal) {
    return this.monitoring.listPrograms(principal);
  }

  @Post("programs")
  createProgram(@CurrentPrincipal() principal: Principal, @Body() body: CreateProgramDto) {
    return this.monitoring.createProgram(principal, body);
  }

  @Get("programs/:programId/thresholds")
  listThresholds(@CurrentPrincipal() principal: Principal, @Param("programId") programId: string) {
    return this.monitoring.listThresholds(principal, programId);
  }

  @Post("programs/:programId/thresholds")
  createThreshold(
    @CurrentPrincipal() principal: Principal,
    @Param("programId") programId: string,
    @Body() body: CreateThresholdDto,
  ) {
    return this.monitoring.createThreshold(principal, programId, body);
  }

  @Get("enrollments")
  listEnrollments(@CurrentPrincipal() principal: Principal) {
    return this.monitoring.listEnrollments(principal);
  }

  @Post("enrollments")
  createEnrollment(@CurrentPrincipal() principal: Principal, @Body() body: CreateEnrollmentDto) {
    return this.monitoring.createEnrollment(principal, body);
  }

  @Get("enrollments/:enrollmentId/measurements")
  listMeasurements(
    @CurrentPrincipal() principal: Principal,
    @Param("enrollmentId") enrollmentId: string,
    @Query("limit") limit?: string,
  ) {
    const parsed = Number(limit);
    return this.monitoring.listMeasurements(principal, enrollmentId, Number.isFinite(parsed) ? parsed : undefined);
  }

  @Post("enrollments/:enrollmentId/measurements")
  createMeasurement(
    @CurrentPrincipal() principal: Principal,
    @Param("enrollmentId") enrollmentId: string,
    @Body() body: CreateMeasurementDto,
  ) {
    return this.monitoring.createMeasurement(principal, { ...body, enrollmentId });
  }

  @Get("alerts")
  listAlerts(@CurrentPrincipal() principal: Principal, @Query("status") status?: string) {
    return this.monitoring.listAlerts(principal, status ?? "open");
  }

  @Post("alerts/:alertId/status")
  updateAlert(@CurrentPrincipal() principal: Principal, @Param("alertId") alertId: string, @Body() body: AlertStatusDto) {
    return this.monitoring.updateAlert(principal, alertId, body);
  }

  @Get("enrollments/:enrollmentId/reviews")
  listReviews(@CurrentPrincipal() principal: Principal, @Param("enrollmentId") enrollmentId: string) {
    return this.monitoring.listReviews(principal, enrollmentId);
  }

  @Post("enrollments/:enrollmentId/reviews")
  createReview(
    @CurrentPrincipal() principal: Principal,
    @Param("enrollmentId") enrollmentId: string,
    @Body() body: CreateReviewDto,
  ) {
    return this.monitoring.createReview(principal, enrollmentId, body);
  }
}
