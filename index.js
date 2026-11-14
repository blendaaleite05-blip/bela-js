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

  return container;
}

async function openPrivateEditor(interaction) {
  const session = {
    color: COR_PADRAO,
    elements: [],
    selected: 0,
    channelId: null
  };
  sessoes.set(interaction.user.id, session);
  await interaction.reply({
    components: [buildEditor(interaction.user, session)],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
  });
  }
      ]));
      if (id === 'ed_refresh') return refreshEditor(interaction, session);
      if (id === 'ed_preview') {
        if (!session.elements.length) {
          return interaction.reply({ content: 'Adicione algum elemento para visualizar a prévia.', flags: MessageFlags.Ephemeral });
        }
        return interaction.reply({
          components: [buildPublishedContainer(session)],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
      }
      if (id === 'ed_publish') {
        if (!session.channelId) {
          return interaction.reply({ content: 'Selecione um canal antes de publicar.', flags: MessageFlags.Ephemeral });
        }
        if (!session.elements.length) {
          return interaction.reply({ content: 'Adicione algum elemento antes de publicar.', flags: MessageFlags.Ephemeral });
        }
        const channel = await interaction.guild.channels.fetch(session.channelId);
        if (!channel || !channel.isTextBased()) {
          return interaction.reply({ content: 'O canal selecionado não é válido.', flags: MessageFlags.Ephemeral });
        }
        await channel.send({
          components: [buildPublishedContainer(session)],
          flags: MessageFlags.IsComponentsV2
        });
        return interaction.reply({ content: 'Painel publicado com sucesso!', flags: MessageFlags.Ephemeral });
      }
      if (id === 'ed_channel') {
        session.channelId = interaction.values[0];
        return refreshEditor(interaction, session);
      }
      if (id === 'ed_select') {
        session.selected = Number(interaction.values[0]);
        return refreshEditor(interaction, session);
      }
      if (id === 'ed_up' || id === 'ed_down') {
        const current = session.selected;
        const next = id === 'ed_up' ? current - 1 : current + 1;
        if (next >= 0 && next < session.elements.length) {
          [session.elements[current], session.elements[next]] =
            [session.elements[next], session.elements[current]];
          session.selected = next;
        }
        return refreshEditor(interaction, session);
      }
      if (id === 'ed_delete') {
        session.elements.splice(session.selected, 1);
        session.selected = Math.max(0, Math.min(session.selected, session.elements.length - 1));
        return refreshEditor(interaction, session);
      }
    }

    if (interaction.isModalSubmit()) {
      const session = sessoes.get(interaction.user.id);
      if (!session) {
        return interaction.reply({ content: 'Sua sessão expirou. Abra /container novamente.', flags: MessageFlags.Ephemeral });
      }
      const id = interaction.customId;

      if (id === 'ed_modal_title' || id === 'ed_modal_text') {
        const content = interaction.fields.getTextInputValue('content').trim();
        if (!content) {
          return interaction.reply({ content: 'O conteúdo não pode ficar vazio.', flags: MessageFlags.Ephemeral });
        }
        if (!addElement(session, {
          type: id === 'ed_modal_title' ? 'title' : 'text',
          content: id === 'ed_modal_title' ? `## ${content}` : content
        })) {
          return interaction.reply({ content: `O limite é de ${MAX_ELEMENTOS} elementos.`, flags: MessageFlags.Ephemeral });
        }
        await interaction.reply({ content: 'Elemento adicionado ao painel.', flags: MessageFlags.Ephemeral });
        const editorMessage = interaction.message;
        if (editorMessage) {
          await editorMessage.edit({ components: [buildEditor(interaction.user, session)] }).catch(() => {});
        }
        return;
      }

      if (id === 'ed_modal_color') {
        const colorText = interaction.fields.getTextInputValue('color').trim().replace('#', '');
        if (!/^[0-9a-fA-F]{6}$/.test(colorText)) {
          return interaction.reply({ content: 'Use um código hexadecimal de 6 caracteres, como B58AD9.', flags: MessageFlags.Ephemeral });
        }
        session.color = parseInt(colorText, 16);
        await interaction.reply({ content: 'Cor atualizada!', flags: MessageFlags.Ephemeral });
        return;
      }

      if (id === 'ed_modal_banner' || id === 'ed_modal_thumbnail') {
        const url = interaction.fields.getTextInputValue('image_url')?.trim();
        const uploaded = interaction.fields.getUploadedFiles('image_file');
        let imageUrl = url;
        if (uploaded?.size) {
          const attachment = uploaded.first();
          imageUrl = attachment.url;
        }
        if (!imageUrl || !validImageUrl(imageUrl)) {
          return interaction.reply({ content: 'Envie uma imagem ou informe um link direto válido (PNG, JPG, GIF ou WEBP).', flags: MessageFlags.Ephemeral });
        }
        const element = id === 'ed_modal_banner'
          ? { type: 'banner', url: imageUrl }
          : {
              type: 'thumbnail',
              url: imageUrl,
              text: interaction.fields.getTextInputValue('image_text')?.trim() || 'Imagem'
            };
        if (!addElement(session, element)) {
          return interaction.reply({ content: `O limite é de ${MAX_ELEMENTOS} elementos.`, flags: MessageFlags.Ephemeral });
        }
        await interaction.reply({ content: 'Imagem adicionada ao painel.', flags: MessageFlags.Ephemeral });
        return;
      }
    }
  } catch (error) {
    console.error('Erro ao processar interação:', error);
    const response = { content: 'Ocorreu um erro ao processar essa ação. Tente novamente.', flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(response).catch(() => {});
    } else {
      await interaction.reply(response).catch(() => {});
    }
  }
});
