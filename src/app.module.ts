import { Module } from '@nestjs/common';
import { DockerModule } from './docker/docker.module'; // aqui o import correto

@Module({
  imports: [DockerModule],
  controllers: [],
  providers: [],
})
export class AppModule { }
