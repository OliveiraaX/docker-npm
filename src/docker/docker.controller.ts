import { Controller, Get, Param } from '@nestjs/common';
import { DockerService, ContainerSummary, ContainerUsage } from './docker.service';

@Controller('docker')
export class DockerController {
    constructor(private readonly dockerService: DockerService) { }

    @Get('containers')
    async listContainers(): Promise<ContainerSummary[]> {
        return this.dockerService.listContainers();
    }

    @Get('containers/:id/summary')
    async getContainerSummary(@Param('id') id: string): Promise<ContainerUsage> {
        return this.dockerService.getContainerSummary(id);
    }
}
export { DockerService };

