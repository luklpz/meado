import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { MulterExceptionFilter } from './shared/multer-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.use(helmet({ contentSecurityPolicy: false }));
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? '*',
    credentials: true,
  });
  app.useGlobalFilters(new MulterExceptionFilter());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
