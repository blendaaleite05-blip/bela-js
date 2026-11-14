const {
  Client, GatewayIntentBits, MessageFlags, ContainerBuilder, TextDisplayBuilder,
  SeparatorBuilder, SeparatorSpacingSize, MediaGalleryBuilder, SectionBuilder,
  ThumbnailBuilder, SlashCommandBuilder, PermissionFlagsBits, REST, Routes,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder,
  TextInputStyle, StringSelectMenuBuilder, ChannelType
} = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');
const express = require('express');

// Ayko: servidor HTTP simples para manter o serviço disponível no Render.
const app = express();
app.get('/', (_req, res) => res.send('Ayko online!'));
app.listen(process.env.PORT || 3000, () => console.log('Servidor web online.'));

const TOKEN = process.env.DISCORD_TOKEN;
const SERVIDOR_ID = '920817412050403399';
const CANAL_VOZ_ID = '1540757131144208444';
const PREFIXO = '!';
const COR_PADRAO = 0xB58AD9;
const MAX_ELEMENTOS = 7;

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

const sessoes = new Map();

const comandos = [
  new SlashCommandBuilder()
    .setName('container')
    .setDescription('Abrir o editor de Containers V2')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
];

async function registrarComandos() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(client.user.id, SERVIDOR_ID), {
    body: comandos.map(c => c.toJSON())
  });
  console.log('Comando /container registrado.');
}

function botao(id, label, style = ButtonStyle.Secondary, emoji) {
  const b = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
  if (emoji) b.setEmoji(emoji);
  return b;
}

function modal(id, title, fields) {
  const m = new ModalBuilder().setCustomId(id).setTitle(title);
  for (const field of fields) {
    const input = new TextInputBuilder()
      .setCustomId(field.id)
      .setLabel(field.label)
      .setStyle(field.multiline ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(field.required !== false)
      .setMaxLength(field.max || 1000);
    if (field.placeholder) input.setPlaceholder(field.placeholder);
    if (field.value) input.setValue(field.value);
    m.addComponents(new ActionRowBuilder().addComponents(input));
  }
  return m;
}

function sessao(userId) {
  if (!sessoes.has(userId)) {
    sessoes.set(userId, { cor: COR_PADRAO, elementos: [], selecionado: 0 });
  }
  return sessoes.get(userId);
}

function montarContainer(s) {
  if (!s.elementos.length) {
    throw new Error('Adicione pelo menos um elemento antes de visualizar ou publicar.');
  }
  const c = new ContainerBuilder().setAccentColor(s.cor);
  for (const item of s.elementos) {
    if (item.tipo === 'titulo' || item.tipo === 'texto') {
      c.addTextDisplayComponents(new TextDisplayBuilder().setContent(item.conteudo));
    } else if (item.tipo === 'banner') {
      c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems({ media: { url: item.url } }));
    } else if (item.tipo === 'thumbnail') {
      const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(item.texto || '‎'))
        .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: item.url } }));
      c.addSectionComponents(section);
    } else if (item.tipo === 'separador') {
      c.addSeparatorComponents(new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Large));
    }
  }
  return c;
}

function montarPainel(user, s) {
  const c = new ContainerBuilder().setAccentColor(s.cor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `# ✦ AYKO — CONTAINER STUDIO\n*Editor de Components V2*\n\n**Criador:** ${user}\n**Elementos:** ${s.elementos.length}/${MAX_ELEMENTOS}\n**Cor:** #${s.cor.toString(16).padStart(6, '0').toUpperCase()}`
    ))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '### ✧ Adicionar elementos\nEscolha o componente que deseja inserir no seu Container.'
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      botao('ayko_add_titulo', 'Título', ButtonStyle.Primary),
      botao('ayko_add_texto', 'Texto', ButtonStyle.Primary),
      botao('ayko_add_banner', 'Banner'),
      botao('ayko_add_thumb', 'Thumbnail'),
      botao('ayko_add_sep', 'Separador')
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      botao('ayko_cor', 'Cor'),
      botao('ayko_refresh', 'Atualizar'),
      botao('ayko_preview', 'Prévia', ButtonStyle.Success),
      botao('ayko_publish', 'Publicar', ButtonStyle.Success)
    ))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '### ✧ Elementos do projeto\n' + (s.elementos.length
        ? s.elementos.map((e, i) => `${i === s.selecionado ? '🔹' : '▫️'} **${i + 1}. ${e.tipo.toUpperCase()}**`).join('\n')
        : '*Seu projeto ainda está vazio.*') +
      '\n\n-# Depois de enviar um formulário, pressione **Atualizar** para recarregar esta lista.'
    ));

  if (s.elementos.length) {
    const options = s.elementos.slice(0, 25).map((e, i) => ({
      label: `${i + 1}. ${e.tipo}`,
      value: String(i),
      description: (e.conteudo || e.url || 'Componente visual').slice(0, 80)
    }));
    c.addActionRowComponents(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('ayko_select').setPlaceholder('Selecione um elemento').addOptions(options)
    ));
    c.addActionRowComponents(new ActionRowBuilder().addComponents(
      botao('ayko_up', '↑ Subir'), botao('ayko_down', '↓ Descer'),
      botao('ayko_delete', 'Excluir', ButtonStyle.Danger)
    ));
  }
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# AYKO STUDIO • Seu espaço de criação'));
  return c;
}

async function abrirEditor(target) {
  const user = target.user || target.author;
  const s = { cor: COR_PADRAO, elementos: [], selecionado: 0 };
  sessoes.set(user.id, s);
  const payload = { components: [montarPainel(user, s)], flags: MessageFlags.IsComponentsV2 };
  if (target.isChatInputCommand?.()) payload.flags |= MessageFlags.Ephemeral;
  await target.reply(payload);
}

async function atualizar(interaction, s) {
  await interaction.update({ components: [montarPainel(interaction.user, s)] });
}

function validarImagem(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) && /\.(png|jpe?g|gif|webp)$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

client.once('clientReady', async () => {
  console.log(`Ayko conectado como ${client.user.tag}`);
  client.user.setPresence({
    activities: [{ name: 'Ao Vivo', type: 1, url: 'https://www.twitch.tv/twitch' }],
    status: 'online'
  });

  try {
    await registrarComandos();
  } catch (error) {
    console.error('Falha ao registrar /container:', error);
  }

  try {
    const guild = await client.guilds.fetch(SERVIDOR_ID);
    const channel = await guild.channels.fetch(CANAL_VOZ_ID);
    if (!channel?.isVoiceBased()) throw new Error('O canal de voz configurado não foi encontrado.');
    joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfMute: false,
      selfDeaf: false
    });
    console.log('Ayko entrou na call.');
  } catch (error) {
    console.error('Não foi possível entrar na call:', error);
  }
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'container') {
      return await abrirEditor(interaction);
    }

    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      const s = sessoes.get(interaction.user.id);
      if (!s) return interaction.reply({
        content: 'Sua sessão expirou. Abra /container novamente.',
        flags: MessageFlags.Ephemeral
      });

      const id = interaction.customId;

      if (id === 'ayko_add_titulo') return interaction.showModal(modal('ayko_modal_titulo', 'Adicionar título', [
        { id: 'conteudo', label: 'Título', max: 200 }
      ]));

      if (id === 'ayko_add_texto') return interaction.showModal(modal('ayko_modal_texto', 'Adicionar texto', [
        { id: 'conteudo', label: 'Descrição', multiline: true, max: 4000 }
      ]));

      if (id === 'ayko_add_banner') return interaction.showModal(modal('ayko_modal_banner', 'Adicionar banner', [
        { id: 'url', label: 'Link direto da imagem', placeholder: 'https://...', max: 1000 }
      ]));

      if (id === 'ayko_add_thumb') return interaction.showModal(modal('ayko_modal_thumb', 'Adicionar thumbnail', [
        { id: 'url', label: 'Link direto da imagem', placeholder: 'https://...', max: 1000 },
        { id: 'texto', label: 'Texto ao lado da imagem', required: false, max: 1000 }
      ]));

      if (id === 'ayko_cor') return interaction.showModal(modal('ayko_modal_cor', 'Cor do Container', [
        { id: 'cor', label: 'Hexadecimal sem #', placeholder: 'B58AD9', max: 6 }
      ]));

      if (id === 'ayko_preview') {
        try {
          return interaction.reply({
            components: [montarContainer(s)],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
          });
        } catch (e) {
          return interaction.reply({ content: e.message, flags: MessageFlags.Ephemeral });
        }
      }

      if (id === 'ayko_publish') return interaction.showModal(modal('ayko_modal_publish', 'Publicar Container', [
        { id: 'canal', label: 'ID do canal de destino', max: 25 }
      ]));

      if (id === 'ayko_add_sep') {
        if (s.elementos.length >= MAX_ELEMENTOS) return interaction.reply({
          content: `Limite desta versão: ${MAX_ELEMENTOS} elementos por Container.`,
          flags: MessageFlags.Ephemeral
        });
        s.elementos.push({ tipo: 'separador' });
        s.selecionado = s.elementos.length - 1;
        return atualizar(interaction, s);
      }

      if (id === 'ayko_refresh') return atualizar(interaction, s);

      if (id === 'ayko_select') {
        s.selecionado = Number(interaction.values[0]);
        return atualizar(interaction, s);
      }

      if (id === 'ayko_up') {
        const i = s.selecionado;
        if (i > 0) {
          [s.elementos[i - 1], s.elementos[i]] = [s.elementos[i], s.elementos[i - 1]];
          s.selecionado--;
        }
        return atualizar(interaction, s);
      }

      if (id === 'ayko_down') {
        const i = s.selecionado;
        if (i < s.elementos.length - 1) {
          [s.elementos[i + 1], s.elementos[i]] = [s.elementos[i], s.elementos[i + 1]];
          s.selecionado++;
        }
        return atualizar(interaction, s);
      }

      if (id === 'ayko_delete') {
        if (s.elementos.length) s.elementos.splice(s.selecionado, 1);
        s.selecionado = Math.max(0, Math.min(s.selecionado, s.elementos.length - 1));
        return atualizar(interaction, s);
      }
    }

    if (interaction.isModalSubmit()) {
      const s = sessoes.get(interaction.user.id);
      if (!s) return interaction.reply({
        content: 'Sua sessão expirou. Abra /container novamente.',
        flags: MessageFlags.Ephemeral
      });

      const id = interaction.customId;

      if (id === 'ayko_modal_publish') {
        const channelId = interaction.fields.getTextInputValue('canal').trim();
        const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);

        if (!channel || !channel.isTextBased() || channel.type === ChannelType.GuildCategory) {
          return interaction.reply({
            content: 'Não encontrei um canal de texto válido com esse ID.',
            flags: MessageFlags.Ephemeral
          });
        }

        const perms = channel.permissionsFor(client.user);
        if (!perms?.has(PermissionFlagsBits.ViewChannel) || !perms.has(PermissionFlagsBits.SendMessages)) {
          return interaction.reply({
            content: 'Preciso das permissões Ver canal e Enviar mensagens nesse canal.',
            flags: MessageFlags.Ephemeral
          });
        }

        try {
          await channel.send({
            components: [montarContainer(s)],
            flags: MessageFlags.IsComponentsV2
          });
          return interaction.reply({
            content: `Container publicado em ${channel}.`,
            flags: MessageFlags.Ephemeral
          });
        } catch (error) {
          console.error('Erro ao publicar:', error);
          return interaction.reply({
            content: 'Não consegui publicar. Confira os elementos e tente novamente.',
            flags: MessageFlags.Ephemeral
          });
        }
      }

      if (s.elementos.length >= MAX_ELEMENTOS) {
        return interaction.reply({
          content: `Limite desta versão: ${MAX_ELEMENTOS} elementos por Container.`,
          flags: MessageFlags.Ephemeral
        });
      }

      if (id === 'ayko_modal_titulo') {
        const value = interaction.fields.getTextInputValue('conteudo').trim();
        s.elementos.push({ tipo: 'titulo', conteudo: `# ${value}` });
      } else if (id === 'ayko_modal_texto') {
        const value = interaction.fields.getTextInputValue('conteudo').trim();
        s.elementos.push({ tipo: 'texto', conteudo: value });
      } else if (id === 'ayko_modal_banner' || id === 'ayko_modal_thumb') {
        const url = interaction.fields.getTextInputValue('url').trim();
        if (!validarImagem(url)) return interaction.reply({
          content: 'Use um link direto terminado em PNG, JPG, GIF ou WEBP.',
          flags: MessageFlags.Ephemeral
        });

        if (id === 'ayko_modal_banner') {
          s.elementos.push({ tipo: 'banner', url });
        } else {
          s.elementos.push({
            tipo: 'thumbnail',
            url,
            texto: interaction.fields.getTextInputValue('texto').trim()
          });
        }
      } else if (id === 'ayko_modal_cor') {
        const value = interaction.fields.getTextInputValue('cor').replace('#', '').trim();
        if (!/^[0-9a-fA-F]{6}$/.test(value)) return interaction.reply({
          content: 'Cor inválida. Exemplo: B58AD9.',
          flags: MessageFlags.Ephemeral
        });
        s.cor = parseInt(value, 16);
      } else {
        return;
      }

      s.selecionado = Math.max(0, s.elementos.length - 1);
      return interaction.reply({
        content: 'Alteração salva! Volte ao painel e pressione **Atualizar** para ver a lista.',
        flags: MessageFlags.Ephemeral
      });
    }
  } catch (error) {
    console.error('Erro em interactionCreate:', error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Ocorreu um erro ao processar essa ação. Confira os logs do Render.',
        flags: MessageFlags.Ephemeral
      }).catch(() => {});
    }
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  if (message.content.trim().toLowerCase() !== `${PREFIXO}container`) return;

  if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return message.reply('Você precisa da permissão **Gerenciar Servidor** para usar esse comando.');
  }

  await abrirEditor(message);
});

client.login(TOKEN);
