import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import { randomUUID } from "node:crypto";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  app.setGlobalPrefix("v1", { exclude: ["health"] });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(",").map((x) => x.trim()),
    credentials: true,
  });
  app.use((req: any, res: any, next: any) => {
    const requestId = req.header("x-request-id") || randomUUID();
    req.requestId = requestId;
    res.setHeader("x-request-id", requestId);
    next();
  });
  app.enableShutdownHooks();
  await app.listen(Number(process.env.API_PORT ?? 4000));
}
void bootstrap();
