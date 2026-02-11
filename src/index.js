require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const mongoose = require('mongoose');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent] });

const TicketManager = require('./module/ticket');
const ticketManager = new TicketManager(client);

const commandHandler = require('./handlers/commandHandler');

client.once('clientReady', async () => {
    console.log(`${client.user.tag} is online`);

    await ticketManager.init(client);
    await commandHandler(client, ticketManager);

    setTimeout(async () => {
        const mongoStatus = mongoose.connection.readyState;
        console.log(`MongoDB status: ${mongoStatus}`);
    });
});

const mongoDb = async () => {
    try {
        console.log('Connecting to MongoDB...');

        const connect = await mongoose.connect(process.env.MONGODB_URL, {
            maxPoolSize: 5,
            connectTimeoutMS: 30000,
            socketTimeoutMS: 45000
        });

        console.log(`Connected to: ${connect.connection.host}`);

        return true;
    } catch (error) {
        console.error('Error connecting to MongoDB:', error.message);
        return false;
    }
};

mongoDb().then((success) => {
    if (success) {
        client.login(process.env.TOKEN_BOT);
    } else {
        console.error('Could not connect to MongoDB. Aborting...');
        process.exit(1);
    }
});