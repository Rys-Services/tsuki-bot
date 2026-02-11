module.exports = {
    name: 'remove',
    description: 'Remove a user from the ticket',
    options: [
        {
            name: 'user',
            description: 'The user to remove',
            type: 9,
            required: true
        }
    ],
    async execute(interaction, ticketManager) {
        await ticketManager.removeUserFromTicket(interaction);
    }
};