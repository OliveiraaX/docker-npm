import { Injectable } from '@nestjs/common';
import { Docker } from 'node-docker-api';
import { Readable } from 'stream';

export interface ContainerInfo {
    id: string;
    name: string;
    image: string;
    status: string;
    logs: string[];
    client: string;
    imageUpdatedAt: string | null;
    number: string | null;
}


@Injectable()
export class DockerService {
    private docker: Docker;

    constructor() {
        this.docker = new Docker({
        });
    }

    webhookExtract(logs: string[]): string {
        for (const log of logs) {
            const urlMatch = log.match(/https?:\/\/([a-zA-Z0-9-]+)\.[^/\s'"]+/);
            if (urlMatch && urlMatch[1]) {
                const subdomain = urlMatch[1];
                return subdomain.charAt(0).toUpperCase() + subdomain.slice(1);
            }
        }
        return 'Unknown';
    }

    cleanAnsi(str: string): string {
        return str
            .replace(/\u001b\[.*?m/g, '')
            .replace(/\\u003E/g, '>')
            .replace(/\\u003C/g, '<')
            .replace(/\\u0026/g, '&')
            .replace(/\u003E/g, '>');
    }

    private extractClientNumber(logs: string[]): string | null {
        for (const log of logs) {
            const match = log.match(/chatId:\s*'(\d+)@c\.us'/);
            if (match && match[1]) {
                return match[1];
            }
        }
        return null;
    }

    private async getLastLinesOfLogs(id: string, numLines: number): Promise<string> {
        const container = this.docker.container.get(id);
        const stream = await container.logs({
            stdout: true,
            stderr: true,
            follow: false,
            tail: 300,
        }) as Readable;

        const chunks: string[] = [];
        return new Promise((resolve, reject) => {
            stream.on('data', (chunk) => {
                chunks.push(chunk.toString('utf8'));
            });
            stream.on('end', () => {
                const full = chunks.join('');
                const lines = full.split(/\r?\n/);
                const cleaned = lines.map(line => line.replace(/^[\x00-\x1F]+/, ''));
                const nonEmpty = cleaned.filter(l => l.trim().length > 0);
                const last = nonEmpty.slice(-numLines);
                resolve(last.join('\n'));
            });
            stream.on('error', err => reject(err));
        });
    }

    private async resolveImageDetails(imageId: string): Promise<{ name: string; updatedAt: Date | null }> {
        try {
            const image = this.docker.image.get(imageId);
            const imageInfo = await image.status() as {
                data: {
                    RepoTags?: string[];
                    Created?: string;
                }
            };

            console.log('🖼️ imageInfo.data:', imageInfo.data);

            const name = imageInfo.data.RepoTags?.[0] || imageId;

            if (!imageInfo.data.Created) {
                console.warn(`⚠️ Imagem ${name} sem campo "Created"`);
            }

            const created = imageInfo.data.Created ? new Date(imageInfo.data.Created) : null;

            return {
                name,
                updatedAt: created,
            };
        } catch (err) {
            console.warn(`Erro ao buscar info da imagem (${imageId}): ${err.message}`);
            return {
                name: imageId,
                updatedAt: null,
            };
        }
    }

    async listContainersWithLogs(): Promise<ContainerInfo[]> {
        const containers = await this.docker.container.list();
        const result: ContainerInfo[] = [];

        for (const cont of containers) {
            const status = await cont.status();
            const data: any = status.data;

            let logs = '';
            try {
                logs = await this.getLastLinesOfLogs(data.Id, 20);
            } catch (err) {
                logs = `Erro ao obter logs: ${err.message || err}`;
            }

            const logsArray = logs
                .split('\n')
                .map(log => this.cleanAnsi(log));

            const client = this.webhookExtract(logsArray);
            const isWorkingInPort3001 = logs.includes('working in port 3001');
            const containerStatus = isWorkingInPort3001 ? 'Não iniciado' : data.State?.Status || 'unknown';
            const number = this.extractClientNumber(logsArray);
            const imageDetails = await this.resolveImageDetails(data.Image);

            const updatedAt = imageDetails.updatedAt;
            const imageUpdatedAt = updatedAt instanceof Date && !isNaN(updatedAt.getTime())
                ? updatedAt.toISOString()
                : null;

            result.push({
                client: client || 'desconhecido',
                number: number || 'desconhecido.',
                id: data.Id,
                name: data.name,
                image: imageDetails.name,
                imageUpdatedAt,
                status: containerStatus,
                logs: logsArray,
            });
        }

        return result;
    }

}
