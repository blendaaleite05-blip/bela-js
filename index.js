const {
  Client,
  GatewayIntentBits,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SlashCommandBuilder,
  PermissionFlagsBits,
  REST,
  Routes,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  FileUploadBuilder,
  LabelBuilder,
  AttachmentBuilder
} = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');
const express = require('express');

// Servidor HTTP do Render
const app = express();
app.get('/', (_req, res) => res.send('Bot online!'));
app.listen(process.env.PORT || 3000, () => console.log('Servidor web online.'));

// Configurações existentes do bot
const TOKEN = process.env.DISCORD_TOKEN;
const SERVIDOR_ID = '920817412050403399';
const CANAL_VOZ_ID = '1540757131144208444';
const PREFIXO = '!';
const COR_PADRAO = 0xB58AD9;
const MAX_ELEMENTOS = 6;

if (!TOKEN) {
  console.error('A variável DISCORD_TOKEN não foi configurada no Render.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// As sessões ficam em memória e são reiniciadas quando o processo reinicia.
const sessoes = new Map();
const PREFIXO_ID = 'painel_editor_';

const comandos = [
  new SlashCommandBuilder()
    .setName('container')
    .setDescription('Abrir o criador de painéis')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
];

async function registrarComandos() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(client.user.id, SERVIDOR_ID), {
    body: comandos.map(command => command.toJSON())
  });
  console.log('Comando /container registrado.');
}

function makeButton(id, label, style = ButtonStyle.Secondary, emoji) {
  const button = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
  if (emoji) button.setEmoji(emoji);
  return button;
}

function makeTextModal(id, title, fields) {
  const modal = new ModalBuilder().setCustomId(id).setTitle(title);
  for (const field of fields) {
    const input = new TextInputBuilder()
      .setCustomId(field.id)
      .setLabel(field.label)
      .setStyle(field.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(field.required !== false)
      .setMaxLength(field.max || 1000);
    if (field.placeholder) input.setPlaceholder(field.placeholder);
    if (field.value) input.setValue(field.value);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }
  return modal;
}

function getSession(userId) {
  if (!sessoes.has(userId)) {
    sessoes.set(userId, {
      color: COR_PADRAO,
      elements: [],
      selected: 0,
      channelId: null
    });
  }
  return sessoes.get(userId);
}

function addElement(session, element) {
  if (session.elements.length >= MAX_ELEMENTOS) return false;
