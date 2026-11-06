import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/** Global: one DB connection shared by every feature that persists data. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
