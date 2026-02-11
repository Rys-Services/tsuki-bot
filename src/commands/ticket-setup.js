const { Config } = require('../module/database');

module.exports = {
    name: 'setup-tickets',
    description: 'Configure the ticket system',
    options: [
        {
            name: 'panel-channel',
            description: 'The channel where the ticket panel will be sent',
            type: 7,
            required: true
        },
        {
            name: 'ticket-category',
            description: 'The category where tickets will be created',
            type: 7,
            required: true
        },
        {
            name: 'transcript-channel',
            description: 'The channel where transcripts will be saved',
            type: 7,
            required: true
        }
    ],
    async execute(interaction, ticketManager) {
        const panelChannel = interaction.options.getChannel('panel-channel');
        const ticketCategory = interaction.options.getChannel('ticket-category');
        const transcriptChannel = interaction.options.getChannel('transcript-channel');

        if (!interaction.member.permissions.has('ADMINISTRATOR')) {
            return interaction.reply({
                content: 'Only administrators can configure the ticket system.',
                flags: 64
            });
        }

        if (panelChannel.type !== 0) {
            return interaction.reply({
                content: 'The panel channel must be a text channel.',
                flags: 64
            });
        }

        if (ticketCategory.type !== 4) {
            return interaction.reply({
                content: 'The ticket category must be a category channel.',
                flags: 64
            });
        }

        if (transcriptChannel.type !== 0) {
            return interaction.reply({
                content: 'The transcript channel must be a text channel.',
                flags: 64
            });
        }

        try {
            const guildId = interaction.guildId;

            let config = await Config.findOne({ guildId });
            
            if (config) {
                config.ticketChannelId = panelChannel.id;
                config.ticketCategoryId = ticketCategory.id;
                config.transcriptChannelId = transcriptChannel.id;
                await config.save();
            } else {
                config = new Config({
                    guildId,
                    ticketChannelId: panelChannel.id,
                    ticketCategoryId: ticketCategory.id,
                    transcriptChannelId: transcriptChannel.id
                });
                await config.save();
            }

            await panelChannel.send({
                embeds: [{
                    title: 'Ticket System',
                    description: 'Click the button below to create a support ticket.',
                    color: 5868786,
                }],
                components: [{
                    type: 1,
                    components: [{
                        type: 2,
                        custom_id: 'create_ticket',
                        label: 'Open Ticket',
                        style: 3
                    }]
                }]
            });

            return interaction.reply({
                content: `Ticket system configured\nPanel Channel: <#${panelChannel.id}>\nTicket Category: ${ticketCategory.name}\nTranscript Channel: <#${transcriptChannel.id}>`,
                flags: 64
            });
        } catch (error) {
            console.error('Error configuring ticket system:', error);
            return interaction.reply({
                content: 'An error occurred while configuring the system.',
                flags: 64
            });
        }
    }
};