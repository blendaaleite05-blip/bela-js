const {
    Client,
    GatewayIntentBits,
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder,
    SlashCommandBuilder,
    PermissionFlagsBits,
    REST,
    Routes
} = require('discord.js');

const { joinVoiceChannel } = require('@discordjs/voice');
const express = require('express');

// ==============================
// MINI SITE PARA O RENDER
// ==============================

const app = express();

app.get('/', (req, res) => {
    res.send('Bot online!');
});

app.listen(3000, () => {
    console.log('Servidor web online na porta 3000');
});

// ==============================
// CONFIGURAÇÕES
// ==============================

const TOKEN = process.env.DISCORD_TOKEN;

const SERVIDOR_ID = '920817412050403399';
const CANAL_VOZ_ID = '1540757131144208444';
const PREFIXO = '!';

// ==============================
// CLIENTE DO BOT
// ==============================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ==============================
// COMANDO SLASH
// ==============================

const comandos = [
    new SlashCommandBuilder()
        .setName('container')
        .setDescription('Abrir o criador de Containers V2')
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        )
];

async function registrarComandos() {
    const rest = new REST({ version: '10' }).setToken(TOKEN);

    await rest.put(
        Routes.applicationGuildCommands(
            client.user.id,
            SERVIDOR_ID
        ),
        { body: comandos.map(c => c.toJSON()) }
    );

    console.log('Comandos slash registrados!');
}

// ==============================
// PAINEL INICIAL
// ==============================

async function abrirCriador(interactionOuMessage) {

    const container = new ContainerBuilder()
        .setAccentColor(0xB58AD9)
        .addTextDisplayComponents(
            new TextDisplayBuilder()
                .setContent('# ✦ CRIADOR DE CONTAINERS')
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder()
                .setContent(
                    'Bem-vindo ao seu editor de Components V2!\n\n' +
                    'Aqui você poderá montar mensagens personalizadas ' +
                    'com banners, títulos, descrições, separadores e botões de cargos.\n\n' +
                    '### ✧ O que teremos no editor?\n' +
                    '• Banners e imagens\n' +
                    '• Títulos e descrições\n' +
                    '• Separadores personalizados\n' +
                    '• Botões de cargos automáticos\n' +
                    '• Prévia antes de publicar\n\n' +
                    'O editor está sendo preparado. Em breve você poderá ' +
                    'montar seus próprios containers por aqui!'
                )
        );

    if (interactionOuMessage.isChatInputCommand?.()) {
        await interactionOuMessage.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2 |
                   MessageFlags.Ephemeral
        });
    } else {
        await interactionOuMessage.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });
    }
}

// ==============================
// EVENTO DE INICIALIZAÇÃO
// ==============================

client.once('clientReady', async () => {

    console.log(`Bot conectado como ${client.user.tag}`);

    client.user.setPresence({
        activities: [{
            name: 'Ao Vivo',
            type: 1,
            url: 'https://www.twitch.tv/twitch'
        }],
        status: 'online'
    });

    console.log('Status de transmissão ativado.');

    // Registrar comandos

    try {
        await registrarComandos();
    } catch (error) {
        console.error('Erro ao registrar comandos:', error);
    }

    // Entrar na call automaticamente

    try {
        const guild = await client.guilds.fetch(SERVIDOR_ID);
        const channel = await guild.channels.fetch(CANAL_VOZ_ID);

        if (!channel || !channel.isVoiceBased()) {
            console.error('Canal de voz inválido.');
            return;
        }

        joinVoiceChannel({
            channelId: channel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfMute: false,
            selfDeaf: false
        });

        console.log('Bot entrou na call.');

    } catch (error) {
        console.error('Erro ao entrar na call:', error);
    }
});

// ==============================
// INTERAÇÕES SLASH
// ==============================

client.on('interactionCreate', async interaction => {

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'container') {
        try {
            await abrirCriador(interaction);
        } catch (error) {
            console.error(error);

            if (!interaction.replied) {
                await interaction.reply({
                    content: 'Não foi possível abrir o criador.',
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    }
});

// ==============================
// COMANDOS POR PREFIXO
// ==============================

client.on('messageCreate', async message => {

    if (message.author.bot || !message.guild) return;

    if (message.content.trim().toLowerCase() === `${PREFIXO}container`) {

        if (!message.member.permissions.has(
            PermissionFlagsBits.ManageGuild
        )) {
            return message.reply(
                'Você precisa da permissão Gerenciar Servidor para usar este comando.'
            );
        }

        await abrirCriador(message);
    }
});

// ==============================
// LOGIN
// ==============================

client.login(TOKEN);
