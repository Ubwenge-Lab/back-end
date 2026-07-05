import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class DiscordService {
    private readonly logger = new Logger(DiscordService.name);
    private readonly webhookUrl: string | undefined;

    constructor(private configService: ConfigService) {
        this.webhookUrl = this.configService.get<string>('DISCORD_WEBHOOK_URL');
    }

    /**
     * Sends a rich embed message to Discord
     */
    async sendAlert(
        title: string,
        description: string,
        color: number = 0xff0000, // Default red
        fields: { name: string; value: string; inline?: boolean }[] = [],
    ): Promise<void> {
        if (!this.webhookUrl) {
            this.logger.debug('Discord webhook URL not configured. Skipping alert.');
            return;
        }

        try {
            await axios.post(this.webhookUrl, {
                embeds: [
                    {
                        title,
                        description,
                        color,
                        timestamp: new Date().toISOString(),
                        fields,
                    },
                ],
            });
        } catch (error) {
            this.logger.error('Failed to send Discord webhook', error instanceof Error ? error.stack : String(error));
        }
    }
}
