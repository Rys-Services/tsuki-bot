const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
    ticketId: { type: String, required: true, unique: true },
    channelName: { type: String, required: true },
    userId: { type: String, required: true },
    claimedBy: { type: String, default: null },
    claimedAt: { type: Date, default: null },
    addedUsers: [{ type: String }],
    closedAt: { type: Date, default: null },
    closedBy: { type: String, default: null },
}, { timestamps: true });

const blacklistSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    reason: { type: String, default: 'No specific reason' },
    blacklistedBy: { type: String, required: true },
    blacklistedAt: { type: Date, default: Date.now }
});

const configSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    ticketChannelId: { type: String, required: true },
    ticketCategoryId: { type: String, required: true },
    transcriptChannelId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = {
    Ticket: mongoose.model('ticket', ticketSchema),
    Blacklist: mongoose.model('blacklist', blacklistSchema),
    Config: mongoose.model('config', configSchema)
};