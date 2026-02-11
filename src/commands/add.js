module.exports = {
    name: 'add',
    description: 'Add a user to the ticket',
    options: [
        {
            name: 'user',
            description: 'The user to add',
            type: 9,
            required: true
        }
    ],
    async execute(interaction, ticketManager) {
        await ticketManager.addUserToTicket(interaction);
    }
};