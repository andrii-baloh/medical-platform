import { Controller, Get, Param } from "@nestjs/common";
import { Public } from "../auth/public.decorator";
import { DoctorsService } from "./doctors.service";

@Controller("doctors")
export class DoctorsController {
  constructor(private readonly doctors: DoctorsService) {}

  @Public()
  @Get()
  list() { return this.doctors.list(); }

  @Public()
  @Get(":slug")
  get(@Param("slug") slug: string) { return this.doctors.getBySlug(slug); }

  @Public()
  @Get(":slug/slots")
  async slots(@Param("slug") slug: string) {
    const doctor = await this.doctors.getBySlug(slug);
    return this.doctors.slots(doctor.id);
  }
}
