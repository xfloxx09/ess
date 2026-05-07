import "reflect-metadata";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { env, isProduction } from "./common/env";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: isProduction ? ["error", "warn", "log"] : ["debug", "verbose", "log", "warn", "error"],
  });

  app.use(cookieParser());

  const allowList = (env.CORS_ORIGINS ?? "")
    .split(",")
    .map((value: string) => value.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowList.length > 0 ? allowList : true,
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Refresh-Token"],
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  app.getHttpAdapter().get("/health", (_req: unknown, res: { json: (body: unknown) => unknown }) =>
    res.json({ ok: true, env: env.NODE_ENV }),
  );

  await app.listen(env.PORT, "0.0.0.0");
  new Logger("Bootstrap").log(`API listening on http://0.0.0.0:${env.PORT} (env=${env.NODE_ENV})`);
}

bootstrap();
