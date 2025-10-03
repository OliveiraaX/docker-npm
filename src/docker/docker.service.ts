// src/docker/docker.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Docker } from 'node-docker-api';


export interface ContainerSummary {
    id: string;
    name: string;
    image: string;
    state: string;
    status: string;
    inspectData: any;
    running: boolean;
}
export interface ContainerUsage {
    id: string;
    image: string;
    state: string;
    createdAt: string;
    cpuPercent: string;
    memoryUsage: string;
    memoryLimit: string;
    memoryPercent: string;
    lastLogs: string[];
}

@Injectable()
export class DockerService {
    private readonly logger = new Logger(DockerService.name);
    private docker: Docker;

    constructor() {
        this.docker = new Docker({
            protocol: 'http',
            port: 2375,
        });
    }

    async listContainers(): Promise<ContainerSummary[]> {
        const containers: any[] = await this.docker.container.list({ all: true });

        const results = await Promise.all(
            containers.map(async (ce: any) => {
                try {
                    const status = await ce.status();
                    const info = status.data as any;

                    // nome
                    const rawNames: string[] | undefined = info.Names;
                    const name = rawNames && rawNames.length > 0
                        ? rawNames[0].replace(/^\//, '')
                        : info.Name?.replace(/^\//, '') ?? 'sem-nome';

                    // pegar último log
                    let lastLogLine = '';
                    try {
                        const logStream = await ce.logs({
                            stdout: true,
                            stderr: true,
                            tail: 1,
                        });
                        const logStr = await this.streamToString(logStream as NodeJS.ReadableStream);
                        const lines = logStr.split('\n').filter(l => l.trim() !== '');
                        if (lines.length > 0) {
                            lastLogLine = lines[lines.length - 1];
                        }
                    } catch (err) {
                        this.logger.warn(`Não foi possível obter último log do container ${info.Id}`, err);
                    }

                    // estado Docker
                    const isDockerRunning = info.State?.Running === true;

                    // log heurística
                    let isLogRunning = false;
                    let errorMessage: string | undefined = undefined;

                    if (lastLogLine) {
                        const txt = lastLogLine.toLowerCase();

                        // Se detectar palavras de erro, marque erro explícito
                        if (/(working in port|erro|error|fail|exception|qrreaderror)/.test(txt)) {
                            errorMessage = lastLogLine;
                            isLogRunning = false;
                        } else {
                            isLogRunning = true;
                        }
                    }

                    // combine os dois
                    const running = isDockerRunning && isLogRunning;

                    return {
                        id: info.Id,
                        image: info.Config?.Image ?? info.Image ?? 'desconhecida',
                        name,
                        inspectData: info.Created,
                        running,
                    } as ContainerSummary;
                } catch (err) {
                    this.logger.error(`Erro inspecionando container`, err);
                    return null;
                }
            }),
        );

        return results.filter((r): r is ContainerSummary => r !== null);
    }

    async getContainerSummary(id: string): Promise<ContainerUsage> {
        const container: any = this.docker.container.get(id);
        console.log('getContainerSummary')
        let logsData: string[] = [];
        try {
            const logStream: any = await container.logs({
                follow: false,
                stdout: true,
                stderr: true,
                tail: 1,
            });
            const logsString = await this.streamToString(logStream as NodeJS.ReadableStream);
            logsData = logsString.split('\n').filter(l => l.trim().length > 0);
        } catch (err) {
            this.logger.warn(`Não foi possível obter logs do container ${id}`, err);
        }

        let cpuPercent = '0%';
        let memoryUsage = '0 MB';
        let memoryLimit = '0 MB';
        let memoryPercent = '0%';
        let createdAt = new Date().toISOString();
        let state = 'unknown';
        let imageName = '';

        try {
            const statsStream: any = await container.stats({ stream: false });
            const statsJson = await this.streamToJson(statsStream as NodeJS.ReadableStream);

            const cpuDelta = statsJson.cpu_stats.cpu_usage.total_usage - statsJson.precpu_stats.cpu_usage.total_usage;
            const systemDelta = statsJson.cpu_stats.system_cpu_usage - statsJson.precpu_stats.system_cpu_usage;
            const onlineCPUs = statsJson.cpu_stats.online_cpus || 1;
            const cpuPerc = systemDelta > 0
                ? (cpuDelta / systemDelta) * onlineCPUs * 100
                : 0;
            cpuPercent = `${cpuPerc.toFixed(2)}%`;

            const memUsage = statsJson.memory_stats.usage;
            const memLimit = statsJson.memory_stats.limit;
            memoryUsage = `${(memUsage / 1024 / 1024).toFixed(2)} MB`;
            memoryLimit = `${(memLimit / 1024 / 1024).toFixed(2)} MB`;
            memoryPercent = `${((memUsage / memLimit) * 100).toFixed(2)}%`;

            imageName = statsJson.name ?? '';
            if (statsJson.read) {
                createdAt = new Date(statsJson.read).toISOString();
            }
            state = statsJson.read ? 'running' : 'stopped';
        } catch (err) {
            this.logger.warn(`Erro obtendo estatísticas do container ${id}`, err);
        }

        return {
            id,
            image: imageName,
            state,
            createdAt,
            cpuPercent,
            memoryUsage,
            memoryLimit,
            memoryPercent,
            lastLogs: logsData,
        };
    }

    private streamToString(stream: NodeJS.ReadableStream): Promise<string> {
        return new Promise((resolve, reject) => {
            console.time('streamToString')
            let data = '';
            stream.on('data', chunk => {
                data += chunk.toString('utf8');
            });
            stream.on('end', () => resolve(data));
            stream.on('error', reject);
            console.timeEnd('streamToString');
        });
    }

    private streamToJson(stream: NodeJS.ReadableStream): Promise<any> {
        return new Promise((resolve, reject) => {
            console.log('streamToJson')
            let data = '';
            stream.on('data', chunk => {
                data += chunk.toString('utf8');
            });
            stream.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (err) {
                    reject(err);
                }
            });
            stream.on('error', reject);
        });
    }
}
