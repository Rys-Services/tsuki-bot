const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits
} = require('discord.js');

const { Ticket } = require('./database');

class TicketManager {
    constructor(client) {
        this.client = client;
    }

    async init(client) {
        client.on('interactionCreate', async (interaction) => {
            if (!interaction.isButton() && !interaction.isCommand()) return;

            if (interaction.customId === 'create_ticket') {
                await this.createTicket(interaction);
            }

            if (interaction.customId === 'close_ticket') {
                await this.closeTicket(interaction);
            }

            if (interaction.customId === 'claim_ticket') {
                await this.claimTicket(interaction);
            }

            if (interaction.customId === 'unclaim_ticket') {
                await this.unclaimTicket(interaction);
            }

            if (interaction.isCommand() && interaction.commandName === 'ticket') {
                await this.createTicket(interaction);
            }
        });

        console.log('TicketManager initialized');
    }

    async sendTicketPanel(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('Ticket System')
            .setDescription('Click the button below to create a support ticket.')
            .setColor('#5865F2')
            .setFooter({ text: 'Ticket System' });

        const button = new ButtonBuilder()
            .setCustomId('create_ticket')
            .setLabel('Open Ticket')
            .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder().addComponents(button);

        await interaction.reply({ 
            embeds: [embed], 
            components: [row],
            ephemeral: false 
        });
    }

    async createTicket(interaction) {
    const userId = interaction.user.id;
    const userName = interaction.user.username;
    const channelName = `ticket-${userName}`;

    const { Blacklist, Config } = require('./database');
    const isBlacklisted = await Blacklist.findOne({ userId });

    if (isBlacklisted) {
        return interaction.reply({ 
            content: 'You are blacklisted and cannot create tickets.', 
            ephemeral: true 
        });
    }

    const existingTicket = await Ticket.findOne({ userId, closedAt: null });
    if (existingTicket) {
        return interaction.reply({ content: 'You already have an open ticket.', ephemeral: true });
    }

    const config = await Config.findOne({ guildId: interaction.guildId });
    
    if (!config) {
        return interaction.reply({
            content: 'Ticket system is not configured. Please ask an admin to configure it.',
            ephemeral: true
        });
    }

    const category = await interaction.guild.channels.fetch(config.ticketCategoryId).catch(() => null);
    
    if (!category) {
        return interaction.reply({
            content: 'Ticket category not found. Please ask an admin to reconfigure the system.',
            ephemeral: true
        });
    }

    const channel = await interaction.guild.channels.create({
        name: channelName,
        type: 0,
        parent: config.ticketCategoryId,
        permissionOverwrites: [
            {
                id: interaction.guild.roles.everyone,
                deny: ['ViewChannel']
            },
            {   
                id: userId,
                allow: ['ViewChannel', 'SendMessages']
            }
        ]
    });
    
    const ticket = new Ticket({
        ticketId: channel.id,
        channelName,
        userId,
        addedUsers: []
    });
    await ticket.save();

    const embed = {
        title: 'Ticket Created',
        description: 'Your ticket has been created. A staff member will assist you shortly.',
        color: 5868786,
        fields: [
            { name: 'User', value: `<@${userId}>`, inline: true },
            { name: 'Status', value: 'Open', inline: true }
        ]
    };

    await channel.send({ 
        content: `<@${userId}>`,
        embeds: [embed],
        components: [{
            type: 1,
            components: [
                {
                    type: 2,
                    custom_id: 'claim_ticket',
                    label: 'Claim Ticket',
                    style: 1
                },
                {
                    type: 2,
                    custom_id: 'close_ticket',
                    label: 'Close Ticket',
                    style: 4
                }
            ]
        }]
    });
    
    await interaction.reply({ content: `Your ticket has been created: ${channel}`, ephemeral: true });
}

    async addUserToTicket(interaction) {
        const targetUser = interaction.options.getUser('usuario');
        const channelId = interaction.channel.id;

        const ticket = await Ticket.findOne({ ticketId: channelId, closedAt: null });

        if (!ticket) {
            return interaction.reply({ content: 'No ticket found in this channel.', ephemeral: true });
        }

        const isStaff = ticket.claimedBy === interaction.user.id || interaction.member.roles.cache.some(role => role.name.toLowerCase().includes('staff') || role.name.toLowerCase().includes('moderator'));
        
        if (!isStaff) {
            return interaction.reply({ content: 'Only staff can add users to tickets.', ephemeral: true });
        }

        if (ticket.addedUsers.includes(targetUser.id)) {
            return interaction.reply({ content: `${targetUser.username} is already added to the ticket.`, ephemeral: true });
        }

        await interaction.channel.permissionOverwrites.edit(targetUser.id, {
            ViewChannel: true,
            SendMessages: true
        });

        ticket.addedUsers.push(targetUser.id);
        await ticket.save();

        await interaction.reply({ content: `${targetUser.username} has been added to the ticket.`, ephemeral: true });
    }

    async removeUserFromTicket(interaction) {
        const targetUser = interaction.options.getUser('usuario');
        const channelId = interaction.channel.id;

        const ticket = await Ticket.findOne({ ticketId: channelId, closedAt: null });

        if (!ticket) {
            return interaction.reply({ content: 'No ticket found in this channel.', ephemeral: true });
        }

        const isStaff = ticket.claimedBy === interaction.user.id || interaction.member.roles.cache.some(role => role.name.toLowerCase().includes('staff') || role.name.toLowerCase().includes('moderator'));
        
        if (!isStaff) {
            return interaction.reply({ content: 'Only staff can remove users from tickets.', ephemeral: true });
        }

        if (targetUser.bot) {
            return interaction.reply({ content: 'Cannot remove bots from the ticket.', ephemeral: true });
        }

        if (!ticket.addedUsers.includes(targetUser.id)) {
            return interaction.reply({ content: `${targetUser.username} is not added to the ticket.`, ephemeral: true });
        }

        await interaction.channel.permissionOverwrites.edit(targetUser.id, {
            ViewChannel: false,
            SendMessages: false
        });

        ticket.addedUsers = ticket.addedUsers.filter(id => id !== targetUser.id);
        await ticket.save();

        await interaction.reply({ content: `${targetUser.username} has been removed from the ticket.`, ephemeral: true });
    }

    async claimTicket(interaction) {
        const staffId = interaction.user.id;
        const channelId = interaction.channel.id;

        const ticket = await Ticket.findOne({ ticketId: channelId, closedAt: null });

        if (!ticket) {
            return interaction.reply({ content: 'No open ticket found in this channel.', ephemeral: true });
        }

        if (ticket.claimedBy) {
            return interaction.reply({ content: `This ticket is already claimed by <@${ticket.claimedBy}>`, ephemeral: true });
        }

        ticket.claimedBy = staffId;
        ticket.claimedAt = new Date();
        await ticket.save();

        const embed = new EmbedBuilder()
            .setTitle('Ticket Claimed')
            .setDescription(`This ticket has been claimed by <@${staffId}>`)
            .setColor('#5865F2')
            .addFields(
                { name: 'User', value: `<@${ticket.userId}>`, inline: true },
                { name: 'Staff', value: `<@${staffId}>`, inline: true },
                { name: 'Status', value: 'Claimed', inline: true }
            )
            .setFooter({ text: 'Ticket System' });

        const unclaimButton = new ButtonBuilder()
            .setCustomId('unclaim_ticket')
            .setLabel('Release Ticket')
            .setStyle(ButtonStyle.Secondary);

        const closeButton = new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('Close Ticket')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(unclaimButton, closeButton);

        await interaction.update({ embeds: [embed], components: [row] });
    }

    async unclaimTicket(interaction) {
        const staffId = interaction.user.id;
        const channelId = interaction.channel.id;

        const ticket = await Ticket.findOne({ ticketId: channelId, closedAt: null });

        if (!ticket) {
            return interaction.reply({ content: 'No open ticket found in this channel.', ephemeral: true });
        }

        if (ticket.claimedBy !== staffId) {
            return interaction.reply({ content: 'Only the staff member who claimed this ticket can release it.', ephemeral: true });
        }

        ticket.claimedBy = null;
        ticket.claimedAt = null;
        await ticket.save();

        const embed = new EmbedBuilder()
            .setTitle('Ticket Released')
            .setDescription('This ticket is now available.')
            .setColor('#5865F2')
            .addFields(
                { name: 'User', value: `<@${ticket.userId}>`, inline: true },
                { name: 'Status', value: 'Available', inline: true }
            )
            .setFooter({ text: 'Ticket System' });

        const claimButton = new ButtonBuilder()
            .setCustomId('claim_ticket')
            .setLabel('Claim Ticket')
            .setStyle(ButtonStyle.Primary);

        const closeButton = new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('Close Ticket')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(claimButton, closeButton);

        await interaction.update({ embeds: [embed], components: [row] });
    }

    async closeTicket(interaction) {
    const channelId = interaction.channel.id;
    const ticket = await Ticket.findOne({ ticketId: channelId, closedAt: null });

    if (!ticket) {
        return interaction.reply({ content: 'No open ticket found in this channel.', ephemeral: true });
    }

    if (ticket.claimedBy && ticket.claimedBy !== interaction.user.id) {
        return interaction.reply({ 
            content: `This ticket was claimed by <@${ticket.claimedBy}>. Only they can close it.`, 
            ephemeral: true 
        });
    }

    ticket.closedAt = new Date();
    ticket.closedBy = interaction.user.id;
    await ticket.save();

    const embed = {
        title: 'Ticket Closed',
        description: 'This ticket has been closed.',
        color: 5868786,
        fields: [
            { name: 'Closed by', value: `<@${interaction.user.id}>`, inline: true }
        ]
    };

    await interaction.update({ embeds: [embed], components: [] });

    const { Config } = require('./database');
    const config = await Config.findOne({ guildId: interaction.guildId });
    
    if (config) {
        await this.generateTranscript(interaction.channel, ticket, config);
    }

    setTimeout(async () => {
        await interaction.channel.delete();
    }, 3000);
}

async generateTranscript(channel, ticket, config) {
    try {
        const messages = await channel.messages.fetch({ limit: 100 });
        const sortedMessages = Array.from(messages.values()).reverse();

        const userObj = await channel.guild.members.fetch(ticket.userId).catch(() => null);
        const closedByObj = await channel.guild.members.fetch(ticket.closedBy).catch(() => null);
        const claimedByObj = ticket.claimedBy ? await channel.guild.members.fetch(ticket.claimedBy).catch(() => null) : null;

        const userName = userObj ? userObj.displayName : `Unknown User`;
        const closedByName = closedByObj ? closedByObj.displayName : `Unknown User`;
        const claimedByName = claimedByObj ? claimedByObj.displayName : 'No one';

const LOGO_BASE64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAQABAADASIAAhEBAxEB/8QAHQABAAIBBQEAAAAAAAAAAAAAAAgJBwECAwUGBP/EAGQQAAICAQMDAwIDBAQIBggPEQABAgMEBQYRBxIhCBMxFCIyQVEJFSNhFnGBtBckMzQ3QnaRGCVDUnKhOFZ0lLHBxNQmJ0RiZGaChIWWoqSz4eQZKDU5RUZTVFVXdZKTldHT8P/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCGQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf/2Q==";
        let htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ticket Transcript - ${ticket.channelName}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        html, body {
            height: 100%;
        }
        body {
            background: #000000;
            color: #dbdee1;
            font-family: 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif;
            display: flex;
        }
        .sidebar {
            background: #0a0a0a;
            width: 240px;
            padding: 16px;
            border-right: 1px solid #1e1f22;
            height: 100vh;
            overflow-y: auto;
            position: fixed;
            z-index: 100;
        }
        .main-content {
            margin-left: 240px;
            display: flex;
            flex-direction: column;
            width: calc(100% - 240px);
            height: 100vh;
            position: relative;
            background: #000000;
        }
        .watermark {
            position: fixed;
            top: 50%;
            left: calc(240px + 40%);
            transform: translate(-50%, -50%);
            opacity: 0.08;
            pointer-events: none;
            z-index: 1;
        }
        .watermark img {
            width: 500px;
            height: 500px;
            object-fit: contain;
        }
        .header {
            background: #0a0a0a;
            padding: 12px 16px;
            border-bottom: 1px solid #1e1f22;
            display: flex;
            align-items: center;
            position: relative;
            z-index: 10;
        }
        .header-title {
            font-weight: 600;
            font-size: 16px;
            color: #ffffff;
        }
        .server-info {
            margin-bottom: 24px;
        }
        .server-name {
            font-weight: 700;
            color: #ffffff;
            margin-bottom: 16px;
            padding: 8px;
            border-radius: 4px;
            background: #1a1a1a;
            font-size: 14px;
        }
        .ticket-info {
            background: #0f0f0f;
            padding: 12px;
            border-radius: 4px;
            font-size: 12px;
            margin-bottom: 16px;
            border-left: 3px solid #5865f2;
        }
        .info-row {
            margin-bottom: 6px;
            display: flex;
            justify-content: space-between;
        }
        .info-label {
            color: #949ba4;
            font-weight: 500;
        }
        .info-value {
            color: #dbdee1;
        }
        .messages-container {
            flex: 1;
            overflow-y: auto;
            padding: 16px 24px;
            display: flex;
            flex-direction: column;
            position: relative;
            z-index: 5;
            background: transparent;
        }
        .message-wrapper {
            display: flex;
            margin-bottom: 8px;
            gap: 12px;
        }
        .message-wrapper:hover {
            background: rgba(79, 84, 92, 0.15);
            margin-left: -12px;
            margin-right: -12px;
            padding: 0 12px;
            border-radius: 4px;
        }
        .avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: #5865f2;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            color: #ffffff;
            font-size: 16px;
        }
        .message-content {
            flex: 1;
        }
        .message-header {
            display: flex;
            align-items: baseline;
            gap: 8px;
            margin-bottom: 2px;
        }
        .author {
            font-weight: 500;
            color: #ffffff;
            font-size: 15px;
        }
        .timestamp {
            color: #949ba4;
            font-size: 12px;
        }
        .text {
            color: #dbdee1;
            word-wrap: break-word;
            white-space: pre-wrap;
            line-height: 1.375;
            font-size: 15px;
            margin-top: 2px;
        }
        .compact-message {
            margin-left: 52px;
            margin-bottom: 2px;
            display: flex;
            gap: 8px;
        }
        .compact-message .timestamp {
            display: none;
        }
        .compact-message:hover .timestamp {
            display: inline;
            color: #949ba4;
            font-size: 11px;
            margin-left: 8px;
        }
        .compact-text {
            color: #dbdee1;
            word-wrap: break-word;
            white-space: pre-wrap;
            font-size: 15px;
            line-height: 1.375;
        }
        .attachments-container {
            margin-top: 12px;
            margin-left: 52px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .attachment-image {
            max-width: 300px;
            max-height: 200px;
            border-radius: 4px;
            cursor: pointer;
            transition: transform 0.2s;
        }
        .attachment-image:hover {
            transform: scale(1.02);
        }
        .attachment-file {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            background: #1a1a1a;
            border-radius: 4px;
            text-decoration: none;
            color: #5865f2;
            font-weight: 500;
            font-size: 13px;
            transition: background 0.2s;
            width: fit-content;
        }
        .attachment-file:hover {
            background: #2a2a2a;
        }
        .attachment-icon {
            font-size: 16px;
        }
        .footer {
            background: #0a0a0a;
            padding: 12px 16px;
            border-top: 1px solid #1e1f22;
            text-align: center;
            color: #72767d;
            font-size: 11px;
            position: relative;
            z-index: 10;
        }
        ::-webkit-scrollbar {
            width: 8px;
        }
        ::-webkit-scrollbar-track {
            background: transparent;
        }
        ::-webkit-scrollbar-thumb {
            background: #1e1f22;
            border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
            background: #2a2a2a;
        }
    </style>
</head>
<body>
    <div class="sidebar">
        <div class="server-info">
            <div class="server-name">Ticket Transcript</div>
        </div>
        <div class="ticket-info">
            <div class="info-row">
                <span class="info-label">User:</span>
            </div>
            <div style="color: #dbdee1; margin-bottom: 12px;">${userName}</div>
            
            <div class="info-row">
                <span class="info-label">Created:</span>
            </div>
            <div style="color: #dbdee1; margin-bottom: 12px; font-size: 11px;">${ticket.createdAt.toLocaleString()}</div>
            
            <div class="info-row">
                <span class="info-label">Closed:</span>
            </div>
            <div style="color: #dbdee1; margin-bottom: 12px; font-size: 11px;">${new Date().toLocaleString()}</div>
            
            <div class="info-row">
                <span class="info-label">Closed by:</span>
            </div>
            <div style="color: #dbdee1; margin-bottom: 12px;">${closedByName}</div>
            
            <div class="info-row">
                <span class="info-label">Claimed by:</span>
            </div>
            <div style="color: #dbdee1;">${claimedByName}</div>
        </div>
    </div>

    <div class="main-content">
        <div class="watermark">
            <img src="data:image/jpeg;base64,${LOGO_BASE64}" alt="">
        </div>
        
        <div class="header">
            <div class="header-title">Ticket Transcript</div>
        </div>
        
        <div class="messages-container">
`;

        let lastAuthor = null;

        for (let i = 0; i < sortedMessages.length; i++) {
            const msg = sortedMessages[i];
            const author = msg.author.username;
            const timestamp = msg.createdTimestamp ? new Date(msg.createdTimestamp).toLocaleString() : 'Unknown';
            const content = msg.content || '';
            const hasAttachments = msg.attachments.size > 0;
            const authorAvatar = msg.author.displayAvatarURL({ extension: 'png', size: 128 });
            
            const prevMsg = i > 0 ? sortedMessages[i - 1] : null;
            const sameAuthor = prevMsg && prevMsg.author.username === author;
            const sameMinute = prevMsg && 
                Math.abs(new Date(prevMsg.createdTimestamp).getTime() - new Date(msg.createdTimestamp).getTime()) < 60000;

            if (!sameAuthor || !sameMinute) {
                htmlContent += `
            <div class="message-wrapper">
                <div class="avatar"><img src="${authorAvatar}" alt="${author}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;"></div>
                <div class="message-content">
                    <div class="message-header">
                        <span class="author">${author}</span>
                        <span class="timestamp">${timestamp}</span>
                    </div>
                    <div class="text">${content}</div>
`;
                if (hasAttachments) {
                    htmlContent += `<div class="attachments-container">`;
                    for (const attachment of msg.attachments.values()) {
                        const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(attachment.name);
                        if (isImage) {
                            try {
                                const response = await fetch(attachment.url);
                                const buffer = await response.arrayBuffer();
                                const base64 = Buffer.from(buffer).toString('base64');
                                const mimeType = attachment.contentType || 'image/png';
                                htmlContent += `<img src="data:${mimeType};base64,${base64}" alt="${attachment.name}" class="attachment-image" title="${attachment.name}">`;
                            } catch (error) {
                                console.error('Error loading image:', error);
                                htmlContent += `<p style="color: #949ba4; font-size: 12px;">Failed to load image: ${attachment.name}</p>`;
                            }
                        } else {
                            const fileSize = (attachment.size / 1024).toFixed(2);
                            htmlContent += `<a href="${attachment.url}" class="attachment-file" target="_blank"><span class="attachment-icon">📎</span><span>${attachment.name} (${fileSize} KB)</span></a>`;
                        }
                    }
                    htmlContent += `</div>`;
                }
                htmlContent += `</div></div>`;
            } else {
                htmlContent += `
            <div class="compact-message">
                <div class="compact-text">${content}</div>
                <span class="timestamp">${timestamp}</span>
            </div>
`;
                if (hasAttachments) {
                    htmlContent += `<div class="attachments-container">`;
                    for (const attachment of msg.attachments.values()) {
                        const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(attachment.name);
                        if (isImage) {
                            try {
                                const response = await fetch(attachment.url);
                                const buffer = await response.arrayBuffer();
                                const base64 = Buffer.from(buffer).toString('base64');
                                const mimeType = attachment.contentType || 'image/png';
                                htmlContent += `<img src="data:${mimeType};base64,${base64}" alt="${attachment.name}" class="attachment-image" title="${attachment.name}">`;
                            } catch (error) {
                                console.error('Error loading image:', error);
                                htmlContent += `<p style="color: #949ba4; font-size: 12px;">Failed to load image: ${attachment.name}</p>`;
                            }
                        } else {
                            const fileSize = (attachment.size / 1024).toFixed(2);
                            htmlContent += `<a href="${attachment.url}" class="attachment-file" target="_blank"><span class="attachment-icon">📎</span><span>${attachment.name} (${fileSize} KB)</span></a>`;
                        }
                    }
                    htmlContent += `</div>`;
                }
            }

            lastAuthor = author;
        }

        htmlContent += `
        </div>

        <div class="footer">
            This transcript was generated on ${new Date().toLocaleString()}
        </div>
    </div>
</body>
</html>
`;

        const transcriptChannel = await channel.guild.channels.fetch(config.transcriptChannelId);
        
        const attachment = {
            attachment: Buffer.from(htmlContent),
            name: `transcript-${ticket.channelName}.html`
        };

        await transcriptChannel.send({
            content: `Transcript for ${ticket.channelName}`,
            files: [attachment]
        });
    } catch (error) {
        console.error('Error generating transcript:', error);
    }
}
}

module.exports = TicketManager;
