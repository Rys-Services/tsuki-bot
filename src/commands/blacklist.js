const { Blacklist } = require('../module/database');

module.exports = {
    name: 'blacklist',
    description: 'Add a user to the ticket blacklist',
    options: [
        {
            name: 'user',
            description: 'The user to blacklist',
            type: 9,
            required: true
        },
        {
            name: 'reason',
            description: 'Reason for blacklist',
            type: 3,
            required: false
        }
    ],
    async execute(interaction, ticketManager) {
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No specific reason';

        const isStaff = interaction.member.permissions.has('MANAGE_MESSAGES') || 
                       interaction.member.roles.cache.some(role => 
                           role.name.toLowerCase().includes('staff') || 
                           role.name.toLowerCase().includes('moderator') ||
                           role.name.toLowerCase().includes('admin')
                       );

        if (!isStaff) {
            return interaction.reply({ 
                content: 'Only staff can use this command.', 
                flags: 64
            });
        }

        if (targetUser.bot) {
            return interaction.reply({ 
                content: 'Cannot blacklist bots.', 
                flags: 64
            });
        }

        try {
            const existingBlacklist = await Blacklist.findOne({ userId: targetUser.id });
            if (existingBlacklist) {
                return interaction.reply({ 
                    content: `${targetUser.username} is already blacklisted.`, 
                    flags: 64
                });
            }

            const blacklist = new Blacklist({
                userId: targetUser.id,
                reason: reason,
                blacklistedBy: interaction.user.id
            });
            await blacklist.save();

            return interaction.reply({ 
                content: `${targetUser.username} has been blacklisted.\nReason: ${reason}`, 
                flags: 64
            });
        } catch (error) {
            console.error('Error adding to blacklist:', error);
            return interaction.reply({ 
                content: 'An error occurred while processing the command.', 
                flags: 64
            });
        }
    }
};