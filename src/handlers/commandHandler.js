const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

module.exports = async (client, ticketManager) => {
    const commandsPath = path.join(__dirname, '../commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    const commands = [];
    const commandMap = {};

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        commands.push({
            name: command.name,
            description: command.description,
            options: command.options || []
        });
        commandMap[command.name] = command;
    }

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN_BOT);

    try {
        console.log('Registering slash commands...');
        
        const guilds = Array.from(client.guilds.cache.keys());
        if (guilds.length > 0) {
            const guildId = guilds[0];
            await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: commands });
            console.log(`Commands registered in server: ${guildId}`);
        } else {
            console.log('Bot is not in any server');
        }
    } catch (error) {
        console.error('Error registering commands:', error.message);
    }

    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isCommand()) return;

        const command = commandMap[interaction.commandName];
        if (!command) return;

        try {
            await command.execute(interaction, ticketManager);
        } catch (error) {
            console.error(`Error executing command ${interaction.commandName}:`, error);
            await interaction.reply({ 
                content: 'An error occurred while executing the command.', 
                flags: 64
            });
        }
    });
};