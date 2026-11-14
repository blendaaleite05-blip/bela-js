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
    session.elements.push(element);
  session.selected = session.elements.length - 1;
  return true;
}

function buildPublishedContainer(session) {
  if (!session.elements.length) throw new Error('Adicione pelo menos um elemento antes de publicar.');
  const container = new ContainerBuilder().setAccentColor(session.color);

  for (const item of session.elements) {
    if (item.type === 'title' || item.type === 'text') {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(item.content));
    } else if (item.type === 'banner') {
      container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems({ media: { url: item.url } })
      );
    } else if (item.type === 'thumbnail') {
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(item.text || 'Imagem'))
          .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: item.url } }))
      );
    } else if (item.type === 'separator') {
      container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large)
      );
    }
  }
  return container;
}

function buildEditor(user, session) {
  const channelLabel = session.channelId ? `<#${session.channelId}>` : '*Nenhum canal selecionado*';
  const list = session.elements.length
    ? session.elements.map((element, index) =>
      `${index === session.selected ? '🔹' : '▫️'} **${index + 1}. ${element.type.toUpperCase()}**`
    ).join('\n')
    : '*Seu painel ainda está vazio. Adicione o primeiro elemento.*';

  const container = new ContainerBuilder()
    .setAccentColor(session.color)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `# ✦ CRIADOR DE PAINÉIS\n` +
      `*Editor de mensagens personalizadas*\n\n` +
      `**Editando:** ${user}\n` +
      `**Elementos:** ${session.elements.length}/${MAX_ELEMENTOS}\n` +
      `**Canal de publicação:** ${channelLabel}\n` +
      `**Cor:** #${session.color.toString(16).padStart(6, '0').toUpperCase()}`
    ))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '### Adicionar conteúdo\nUse os botões para inserir textos e imagens. As alterações ficam privadas até publicar.'
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      makeButton('ed_title', 'Título', ButtonStyle.Primary),
      makeButton('ed_text', 'Texto', ButtonStyle.Primary),
      makeButton('ed_banner', 'Banner'),
      makeButton('ed_thumb', 'Thumbnail'),
      makeButton('ed_separator', 'Separador')
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      makeButton('ed_color', 'Cor'),
      makeButton('ed_refresh', 'Atualizar'),
      makeButton('ed_preview', 'Prévia', ButtonStyle.Success),
      makeButton('ed_publish', 'Publicar', ButtonStyle.Success)
    ))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### Estrutura do painel\n${list}`))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('ed_channel')
        .setPlaceholder('Definir canal de publicação')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(1)
        .setMaxValues(1)
    ));

  if (session.elements.length) {
    const options = session.elements.map((element, index) => ({
      label: `${index + 1}. ${element.type}`,
      value: String(index),
      description: (element.content || element.url || 'Elemento visual').slice(0, 80)
    }));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
      new (require('discord.js').StringSelectMenuBuilder)()
        .setCustomId('ed_select')
        .setPlaceholder('Selecionar elemento para organizar')
        .addOptions(options)
    ));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
      makeButton('ed_up', '↑ Subir'),
      makeButton('ed_down', '↓ Descer'),
      makeButton('ed_delete', 'Excluir', ButtonStyle.Danger)
    ));
  }
async function refreshEditor(interaction, session) {
  await interaction.update({
    components: [buildEditor(interaction.user, session)]
  });
}

function validImageUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) &&
      /\.(png|jpe?g|gif|webp|avif)$/i.test(url.pathname);
  } catch {
    return false;
  }
}

async function showImageModal(interaction, modalId, title) {
  const modal = new ModalBuilder().setCustomId(modalId).setTitle(title);
  const upload = new FileUploadBuilder()
    .setCustomId('image_file')
    .setMinValues(0)
    .setMaxValues(1)
    .setRequired(false)
    .setFileTypes('image');
  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel('Enviar imagem')
      .setDescription('Anexe uma imagem ou deixe vazio para usar um link.')
      .setFileUploadComponent(upload)
  );
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('image_url')
      .setLabel('Ou cole o link direto da imagem')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(1000)
      .setPlaceholder('https://...')
  ));
  if (modalId === 'ed_modal_thumbnail') {
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('image_text')
        .setLabel('Texto ao lado da thumbnail')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(500)
    ));
  }
  await interaction.showModal(modal);
}

client.once('clientReady', async () => {
  console.log(`Bot conectado como ${client.user.tag}`);
  client.user.setPresence({
    activities: [{ name: 'Ao Vivo', type: 1, url: 'https://www.twitch.tv/twitch' }],
    status: 'online'
  });
  try {
    await registrarComandos();
  } catch (error) {
    console.error('Erro ao registrar comandos:', error);
  }
  try {
    const guild = await client.guilds.fetch(SERVIDOR_ID);
    const voiceChannel = await guild.channels.fetch(CANAL_VOZ_ID);
    if (!voiceChannel?.isVoiceBased()) throw new Error('Canal de voz inválido.');
    joinVoiceChannel({
      channelId: voiceChannel.id,
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

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'container') {
      return await openPrivateEditor(interaction);
    }

    if (interaction.isButton() && interaction.customId.startsWith(PREFIXO_ID)) {
      const ownerId = interaction.customId.slice(PREFIXO_ID.length);
      if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: 'Esse botão pertence a outra pessoa.', flags: MessageFlags.Ephemeral });
      }
      await interaction.message.delete().catch(() => {});
      return openPrivateEditor(interaction);
    }

    if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isChannelSelectMenu()) {
      const session = sessoes.get(interaction.user.id);
      if (!session) {
        return interaction.reply({ content: 'Sua sessão expirou. Abra /container novamente.', flags: MessageFlags.Ephemeral });
      }
      const id = interaction.customId;

      if (id === 'ed_title') return interaction.showModal(makeTextModal('ed_modal_title', 'Adicionar título', [
        { id: 'content', label: 'Título', max: 200 }
      ]));
      if (id === 'ed_text') return interaction.showModal(makeTextModal('ed_modal_text', 'Adicionar texto', [
        { id: 'content', label: 'Descrição', paragraph: true, max: 4000 }
      ]));
      if (id === 'ed_banner') return showImageModal(interaction, 'ed_modal_banner', 'Adicionar banner');
      if (id === 'ed_thumb') return showImageModal(interaction, 'ed_modal_thumbnail', 'Adicionar thumbnail');
      if (id === 'ed_color') return interaction.showModal(makeTextModal('ed_modal_color', 'Cor do painel', [
        { id: 'color', label: 'Código hexadecimal sem #', placeholder: 'B58AD9', max: 6 }
      ]));
      if (id === 'ed_refresh') return refreshEditor(interaction, session);
      if (id === 'ed_preview') {
        try {
          return interaction.reply({ components: [buildPublishedContainer(session)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        } catch (error) {
          return interaction.reply({ content: error.message, flags: MessageFlags.Ephemeral });
        }
      }
            if (id === 'ed_publish') {
        if (!session.channelId) return interaction.reply({ content: 'Primeiro escolha o canal no campo **Definir canal de publicação**.', flags: MessageFlags.Ephemeral });
        if (!session.elements.length) return interaction.reply({ content: 'Adicione pelo menos um elemento antes de publicar.', flags: MessageFlags.Ephemeral });
        const channel = await interaction.guild.channels.fetch(session.channelId).catch(() => null);
        if (!channel?.isTextBased()) return interaction.reply({ content: 'O canal selecionado não está disponível.', flags: MessageFlags.Ephemeral });
        const permissions = channel.permissionsFor(client.user);
        if (!permissions?.has(PermissionFlagsBits.ViewChannel) || !permissions.has(PermissionFlagsBits.SendMessages)) {
          return interaction.reply({ content: 'Não tenho permissão para ver e enviar mensagens nesse canal.', flags: MessageFlags.Ephemeral });
        }
        await channel.send({ components: [buildPublishedContainer(session)], flags: MessageFlags.IsComponentsV2 });
        return interaction.reply({ content: `Painel publicado em ${channel}.`, flags: MessageFlags.Ephemeral });
      }
      if (id === 'ed_channel') {
        session.channelId = interaction.values[0];
        return refreshEditor(interaction, session);
      }
      if (id === 'ed_separator') {
        if (!addElement(session, { type: 'separator' })) return interaction.reply({ content: `Limite de ${MAX_ELEMENTOS} elementos nesta versão.`, flags: MessageFlags.Ephemeral });
        return refreshEditor(interaction, session);
      }
      if (id === 'ed_select') {
        session.selected = Number(interaction.values[0]);
        return refreshEditor(interaction, session);
      }
      if (id === 'ed_up' || id === 'ed_down') {
        const index = session.selected;
        const target = id === 'ed_up' ? index - 1 : index + 1;
        if (target >= 0 && target < session.elements.length) {
          [session.elements[index], session.elements[target]] = [session.elements[target], session.elements[index]];
          session.selected = target;
        }
        return refreshEditor(interaction, session);
      }
      if (id === 'ed_delete') {
        if (session.elements.length) session.elements.splice(session.selected, 1);
        session.selected = Math.max(0, Math.min(session.selected, session.elements.length - 1));
        return refreshEditor(interaction, session);
      }
    }

    if (interaction.isModalSubmit()) {
      const session = sessoes.get(interaction.user.id);
      if (!session) return interaction.reply({ content: 'Sua sessão expirou. Abra /container novamente.', flags: MessageFlags.Ephemeral });
      const id = interaction.customId;

      if (id === 'ed_modal_title' || id === 'ed_modal_text') {
        const content = interaction.fields.getTextInputValue('content').trim();
        if (!content) return interaction.reply({ content: 'O conteúdo não pode ficar vazio.', flags: MessageFlags.Ephemeral });
        if (!addElement(session, { type: id === 'ed_modal_title' ? 'title' : 'text', content: id === 'ed_modal_title' ? `# ${content}` : content })) {
          return interaction.reply({ content: `Limite de ${MAX_ELEMENTOS} elementos nesta versão.`, flags: MessageFlags.Ephemeral });
        }
      } else if (id === 'ed_modal_color') {
        const value = interaction.fields.getTextInputValue('color').replace('#', '').trim();
        if (!/^[0-9a-fA-F]{6}$/.test(value)) return interaction.reply({ content: 'Cor inválida. Exemplo: B58AD9.', flags: MessageFlags.Ephemeral });
        session.color = parseInt(value, 16);
      } else if (id === 'ed_modal_banner' || id === 'ed_modal_thumbnail') {
        if (session.elements.length >= MAX_ELEMENTOS) return interaction.reply({ content: `Limite de ${MAX_ELEMENTOS} elementos nesta versão.`, flags: MessageFlags.Ephemeral });
        const url = interaction.fields.getTextInputValue('image_url').trim();
        const files = interaction.fields.getUploadedFiles('image_file');
        const uploaded = files?.first();
        const imageUrl = uploaded?.url || url;
        if (!imageUrl || (!uploaded && !validImageUrl(imageUrl))) {
          return interaction.reply({ content: 'Anexe uma imagem ou informe um link direto válido.', flags: MessageFlags.Ephemeral });
        }
        const element = { type: id === 'ed_modal_banner' ? 'banner' : 'thumbnail', url: imageUrl };
        if (id === 'ed_modal_thumbnail') element.text = interaction.fields.getTextInputValue('image_text').trim();
        addElement(session, element);
      } else {
        return;
      }
      return interaction.reply({ content: 'Alteração salva! Volte ao editor e continue montando seu painel.', flags: MessageFlags.Ephemeral });
    }
  } catch (error) {
    console.error('Erro ao processar interação:', error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Ocorreu um erro. Confira os logs do Render.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
});

// Comando tradicional: a mensagem é apagada e o bot deixa um botão temporário.
// O clique nesse botão abre o editor em ephemeral dentro do servidor.
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  if (message.content.trim().toLowerCase() !== `${PREFIXO}container`) return;
  if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.delete().catch(() => {});
    return;
  }
  await message.delete().catch(() => {});
  const opener = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${PREFIXO_ID}${message.author.id}`).setLabel('Abrir editor privado').setStyle(ButtonStyle.Primary)
  );
  const prompt = await message.channel.send({
    content: 'Clique abaixo para abrir seu editor privado.',
    components: [opener]
  });
  setTimeout(() => prompt.delete().catch(() => {}), 60000);
});


client.login(TOKEN);
