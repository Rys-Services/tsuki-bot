const { Blacklist } = require('../module/database');

module.exports = {
    name: 'unblacklist',
    description: 'Remove a user from the ticket blacklist',
    options: [
        {
            name: 'user',
            description: 'The user to remove from blacklist',
            type: 9,
            required: true
        }
    ],
    async execute(interaction, ticketManager) {
        const targetUser = interaction.options.getUser('user');

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

        try {
            const blacklist = await Blacklist.findOneAndDelete({ userId: targetUser.id });

            if (!blacklist) {
                return interaction.reply({ 
                    content: `${targetUser.username} is not blacklisted.`, 
                    flags: 64
                });
            }

            return interaction.reply({ 
                content: `${targetUser.username} has been removed from the blacklist.`, 
                flags: 64
            });
        } catch (error) {
            console.error('Error removing from blacklist:', error);
            return interaction.reply({ 
                content: 'An error occurred while processing the command.', 
                flags: 64
            });
        }
    }
};