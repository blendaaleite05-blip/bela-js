const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');
const express = require('express');

// Cria um mini site para a hospedagem não deixar o bot dormir
const app = express();
app.get('/', (req, res) => res.send('Online'));
app.listen(3000);

// Configura as permissões básicas do robô
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// CONFIGURAÇÃO: COLOQUE SEUS DADOS ENTRE AS ASPAS
const TOKEN = process.env.DISCORD_TOKEN;
const CANAL_VOZ_ID = '1540757131144208444';
const SERVIDOR_ID = '920817412050403399';

// Executa assim que o bot liga na internet
client.once('ready', () => {
    // Ativa o status roxo de transmissão oficial
    client.user.setPresence({
        activities: [{ 
            name: 'Ao Vivo', // Texto ao lado da bolinha roxa
            type: 1, // Tipo 1 ativa o modo Transmitindo
            url: 'https://twitch.tv' // Link necessário para a transmissão funcionar
        }],
        status: 'online'
    });

    try {
        // Conecta na sua call e fica desmutado e escutando
        joinVoiceChannel({
            channelId: CANAL_VOZ_ID,
            guildId: SERVIDOR_ID,
            adapterCreator: client.guilds.cache.get(SERVIDOR_ID).voiceAdapterCreator,
            selfMute: false, // false = Microfone verde
            selfDeaf: false  // false = Fone verde
        });
    } catch (e) {}
});

// Liga o bot usando a sua chave secreta (Token)
client.login(TOKEN);
