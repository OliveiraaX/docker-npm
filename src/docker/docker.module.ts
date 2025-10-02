import { Module } from '@nestjs/common';
import { DockerController, DockerService } from './docker.controller';

@Module({
    providers: [DockerService],
    controllers: [DockerController],
    exports: [DockerService],
})
export class DockerModule { }
