import { Controller, Get } from '@nestjs/common';
import { DockerService, ContainerInfo } from './docker.service';

@Controller('docker')
export class DockerController {
    constructor(private readonly dockerService: DockerService) { }

    @Get('containers')
    async getAll(): Promise<ContainerInfo[]> {
        return this.dockerService.listContainersWithLogs();
    }
}
