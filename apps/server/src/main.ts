import 'dotenv/config';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3100);
  await app.listen(port);
  Logger.log(`Server listening on http://localhost:${port} (model: ${process.env.MOCK_LLM === '1' ? 'scripted mock' : process.env.OPENAI_MODEL ?? 'gpt-6-luna'})`, 'Bootstrap');
}
void bootstrap();
