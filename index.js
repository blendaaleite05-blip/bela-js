
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
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder
} = require('discord.js');

const { joinVoiceChannel } = require('@discordjs/voice');
const express = require('express');
const {
  initDatabase,
  getOrCreateWallet
} = require('./database');
// Servidor HTTP exigido pelo Render
const app = express();

app.get('/', (_req, res) => res.send('Bot online!'));

app.listen(process.env.PORT || 3000, () => {
  console.log('Servidor web online.');
});

// Configurações
const TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SERVIDOR_ID = '920817412050403399';
const CANAL_VOZ_ID = '1540757131144208444';
const PREFIXO = '!';
const COR_PADRAO = 0xB58AD9;
const MAX_ELEMENTOS = 40;
const PREFIXO_ID = 'painel_editor_';

if (!TOKEN) {
  console.error('A variável DISCORD_TOKEN não foi configurada no Render.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const sessoes = new Map();

const comandos = [
  new SlashCommandBuilder()
    .setName('container')
    .setDescription('Abrir o criador de painéis')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
];

async function registrarComandos() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(client.user.id, SERVIDOR_ID),
    { body: comandos.map(command => command.toJSON()) }
  );

  console.log('Comando /container registrado.');
}

function makeButton(id, label, style = ButtonStyle.Secondary) {
  return new ButtonBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style);
}

function makeTextModal(id, title, fields) {
  const modal = new ModalBuilder()
    .setCustomId(id)
    .setTitle(title);

  for (const field of fields) {
    const input = new TextInputBuilder()
      .setCustomId(field.id)
      .setLabel(field.label)
      .setStyle(
        field.paragraph
          ? TextInputStyle.Paragraph
          : TextInputStyle.Short
      )
      .setRequired(field.required !== false)
      .setMaxLength(field.max || 1000);

    if (field.placeholder) input.setPlaceholder(field.placeholder);
    if (field.value) input.setValue(field.value);

    modal.addComponents(
      new ActionRowBuilder().addComponents(input)
    );
  }

  return modal;
}

function addElement(session, element) {
  const custos = {
    title: 1,
    text: 1,
    banner: 1,
    thumbnail: 3,
    separator: 1,
    role: 3
  };

  const totalAtual = 1 + session.elements.reduce(
    (total, item) => total + (custos[item.type] || 1),
    0
  );

  const custoNovo = custos[element.type] || 1;

  if (totalAtual + custoNovo > MAX_ELEMENTOS) {
    throw new Error(
      'Limite de 40 componentes atingido. Remova algum elemento antes de adicionar outro.'
    );
  }

  session.elements.push(element);
  session.selected = session.elements.length - 1;

  return true;
    }

function buildPublishedContainer(session) {
  if (!session.elements.length) {
    throw new Error('Adicione pelo menos um elemento antes de publicar.');
  }

  const container = new ContainerBuilder()
    .setAccentColor(session.color);

  for (const item of session.elements) {

    if (item.type === 'title' || item.type === 'text') {

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(item.content)
      );

    } else if (item.type === 'banner') {

      container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems({
          media: { url: item.url }
        })
      );

    } else if (item.type === 'thumbnail') {

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(item.text || 'Imagem')
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder({
              media: { url: item.url }
            })
          )
      );

    } else if (item.type === 'separator') {

      container.addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(true)
          .setSpacing(SeparatorSpacingSize.Large)
      );

    } else if (item.type === 'role') {

      const button = new ButtonBuilder()
        .setCustomId(`role_toggle_${item.roleId}`)
        .setStyle(ButtonStyle.Secondary);

      if (item.emoji) {
        button.setEmoji({ id: item.emoji });
      }

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `### ${item.name}\n${item.description || 'Selecione abaixo para receber este cargo.'}`
            )
          )
          .setButtonAccessory(button)
      );
    }
  }

  return container;
}

function buildEditor(user, session) {
  const channelLabel = session.channelId
    ? `<#${session.channelId}>`
    : 'Nenhum canal selecionado';

  const list = session.elements.length
    ? session.elements.map((element, index) => {
        let description = '';

        if (element.type === 'role') {
          description = ` — ${element.name}`;
        } else if (element.type === 'title' || element.type === 'text') {
          description = ` — ${element.content.slice(0, 40)}`;
        }

        return `${index === session.selected ? '🔹' : '▫️'} **${index + 1}. ${element.type.toUpperCase()}${description}**`;
      }).join('\n')
    : 'Seu painel ainda está vazio. Adicione o primeiro elemento.';

  const container = new ContainerBuilder()
    .setAccentColor(session.color)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# ✦ CRIADOR DE PAINÉIS\n` +
        `*Editor de mensagens personalizadas*\n\n` +
        `**Editando:** ${user}\n` +
        `**Elementos:** ${session.elements.length}\n` +
        `**Canal de publicação:** ${channelLabel}\n` +
        `**Cor:** #${session.color.toString(16).padStart(6, '0').toUpperCase()}`
      )
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '### Adicionar conteúdo\nUse os botões para inserir textos, imagens e cargos. As alterações ficam privadas até publicar.'
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        makeButton('ed_title', 'Título', ButtonStyle.Primary),
        makeButton('ed_text', 'Texto', ButtonStyle.Primary),
        makeButton('ed_banner', 'Banner'),
        makeButton('ed_thumb', 'Thumbnail'),
        makeButton('ed_separator', 'Separador')
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        makeButton('ed_roles', 'Cargos', ButtonStyle.Primary),
        makeButton('ed_color', 'Cor'),
        makeButton('ed_refresh', 'Atualizar'),
        makeButton('ed_preview', 'Prévia', ButtonStyle.Success),
        makeButton('ed_publish', 'Publicar', ButtonStyle.Success)
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Large)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### Estrutura do painel\n${list}`
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('ed_channel')
          .setPlaceholder('Definir canal de publicação')
          .setChannelTypes(
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement
          )
          .setMinValues(1)
          .setMaxValues(1)
      )
    );

  if (session.elements.length) {
    const options = session.elements.slice(0, 25).map((element, index) => ({
      label: `${index + 1}. ${element.type}`,
      value: String(index),
      description: (
        element.name ||
        element.content ||
        element.url ||
        'Elemento visual'
      ).slice(0, 80)
    }));

    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ed_select')
          .setPlaceholder('Selecionar elemento para organizar')
          .addOptions(options)
      )
    );

    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        makeButton('ed_up', '↑ Subir'),
        makeButton('ed_down', '↓ Descer'),
        makeButton('ed_delete', 'Excluir', ButtonStyle.Danger)
      )
    );
  }

  return container;
}

async function openPrivateEditor(interaction) {
  const session = {
    color: COR_PADRAO,
    elements: [],
    selected: 0,
    channelId: null,
    pendingRole: null
  };

  sessoes.set(interaction.user.id, session);

  await interaction.reply({
    components: [buildEditor(interaction.user, session)],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
  });
}

async function refreshEditor(interaction, session) {
  await interaction.update({
    components: [buildEditor(interaction.user, session)]
  });
}

function validImageUrl(value) {
  try {
    const url = new URL(value);

    return (
      ['http:', 'https:'].includes(url.protocol) &&
      /\.(png|jpe?g|gif|webp|avif)$/i.test(url.pathname)
    );

  } catch {
    return false;
  }
}

async function showImageModal(interaction, modalId, title, withText = false) {
  const fields = [
    {
      id: 'image_url',
      label: 'Link direto da imagem',
      placeholder: 'https://site.com/imagem.png',
      max: 1000
    }
  ];

  if (withText) {
    fields.push({
      id: 'image_text',
      label: 'Texto ao lado da thumbnail',
      required: false,
      max: 500
    });
  }

  await interaction.showModal(
    makeTextModal(modalId, title, fields)
  );
}

// Conexão do bot e entrada na call
client.once('clientReady', async () => {
  console.log(`Bot conectado como ${client.user.tag}`);

  client.user.setPresence({
    activities: [
      {
        name: 'Ao Vivo',
        type: 1,
        url: 'https://www.twitch.tv/twitch'
      }
    ],
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

    if (!voiceChannel?.isVoiceBased()) {
      throw new Error('Canal de voz inválido.');
    }

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

// Alternar cargos dos membros
async function toggleRole(interaction) {
  const roleId = interaction.customId.replace('role_toggle_', '');
  const guild = interaction.guild;

  if (!guild) {
    return interaction.reply({
      content: 'Este botão só funciona dentro do servidor.',
      flags: MessageFlags.Ephemeral
    });
  }

  const role = await guild.roles.fetch(roleId).catch(() => null);

  if (!role) {
    return interaction.reply({
      content: 'Esse cargo não está mais disponível.',
      flags: MessageFlags.Ephemeral
    });
  }

  const botMember = guild.members.me;

  if (
    !botMember ||
    !botMember.permissions.has(PermissionFlagsBits.ManageRoles)
  ) {
    return interaction.reply({
      content: 'Preciso da permissão Gerenciar cargos para realizar essa ação.',
      flags: MessageFlags.Ephemeral
    });
  }

  if (
    role.managed ||
    botMember.roles.highest.comparePositionTo(role) <= 0
  ) {
    return interaction.reply({
      content: 'Não consigo gerenciar esse cargo. Verifique a posição dele na hierarquia do servidor.',
      flags: MessageFlags.Ephemeral
    });
  }

  const member = await guild.members.fetch(interaction.user.id);

  try {
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId);

      return interaction.reply({
        content: `O cargo **${role.name}** foi removido.`,
        flags: MessageFlags.Ephemeral
      });
    }

    await member.roles.add(roleId);

    return interaction.reply({
      content: `Você recebeu o cargo **${role.name}**!`,
      flags: MessageFlags.Ephemeral
    });

  } catch (error) {
    console.error('Erro ao alterar cargo:', error);

    return interaction.reply({
      content: 'Não foi possível alterar seu cargo. Verifique minhas permissões.',
      flags: MessageFlags.Ephemeral
    });
  }
}

// Interações do editor
client.on('interactionCreate', async interaction => {
  try {

    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === 'container'
    ) {
      return await openPrivateEditor(interaction);
    }

    // Botões de cargos dos painéis publicados
    if (
      interaction.isButton() &&
      interaction.customId.startsWith('role_toggle_')
    ) {
      return await toggleRole(interaction);
    }

    // Reabrir editor privado
    if (
      interaction.isButton() &&
      interaction.customId.startsWith(PREFIXO_ID)
    ) {
      const ownerId = interaction.customId.slice(PREFIXO_ID.length);

      if (interaction.user.id !== ownerId) {
        return interaction.reply({
          content: 'Esse botão pertence a outra pessoa.',
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.message.delete().catch(() => {});
      return await openPrivateEditor(interaction);
    }

    if (
      interaction.isButton() ||
      interaction.isStringSelectMenu() ||
      interaction.isChannelSelectMenu() ||
      interaction.isRoleSelectMenu()
    ) {
      const session = sessoes.get(interaction.user.id);

      if (!session) {
        return interaction.reply({
          content: 'Sua sessão expirou. Abra /container novamente.',
          flags: MessageFlags.Ephemeral
        });
      }

      const id = interaction.customId;

      // Título
      if (id === 'ed_title') {
        return interaction.showModal(
          makeTextModal('ed_modal_title', 'Adicionar título', [
            { id: 'content', label: 'Título', max: 200 }
          ])
        );
      }

      // Texto
      if (id === 'ed_text') {
        return interaction.showModal(
          makeTextModal('ed_modal_text', 'Adicionar texto', [
            {
              id: 'content',
              label: 'Descrição',
              paragraph: true,
              max: 4000
            }
          ])
        );
      }

      // Banner
      if (id === 'ed_banner') {
        return showImageModal(
          interaction,
          'ed_modal_banner',
          'Adicionar banner'
        );
      }

      // Thumbnail
      if (id === 'ed_thumb') {
        return showImageModal(
          interaction,
          'ed_modal_thumbnail',
          'Adicionar thumbnail',
          true
        );
      }

      // Configurar cargos
      if (id === 'ed_roles') {
        return interaction.showModal(
          makeTextModal('ed_modal_role', 'Configurar cargo', [
            {
              id: 'role_name',
              label: 'Nome exibido no painel',
              placeholder: 'Exemplo: Membro VIP',
              max: 100
            },
            {
              id: 'role_description',
              label: 'Descrição abaixo do nome',
              placeholder: 'Explique o que esse cargo representa.',
              paragraph: true,
              max: 500
            },
            {
              id: 'role_emoji',
              label: 'ID do emoji personalizado (opcional)',
              placeholder: 'Cole o ID do emoji aqui',
              required: false,
              max: 20
            }
          ])
        );
      }

      // Selecionar cargo real do servidor
      if (id === 'ed_role_select') {
        const roleId = interaction.values[0];
        const role = await interaction.guild.roles.fetch(roleId).catch(() => null);

        if (!role) {
          return interaction.reply({
            content: 'Não foi possível encontrar esse cargo.',
            flags: MessageFlags.Ephemeral
          });
        }

        const pending = session.pendingRole;

        if (!pending) {
          return interaction.update({
            content: 'Configuração de cargo não encontrada. Tente novamente.',
            components: []
          });
        }

        addElement(session, {
          type: 'role',
          name: pending.name,
          description: pending.description,
          emoji: pending.emoji,
          roleId: role.id
        });

        session.pendingRole = null;

        return interaction.update({
          content: `Cargo **${role.name}** adicionado ao painel! Clique em **Atualizar** no editor para visualizar.`,
          components: []
        });
      }

      // Cor
      if (id === 'ed_color') {
        return interaction.showModal(
          makeTextModal('ed_modal_color', 'Cor do painel', [
            {
              id: 'color',
              label: 'Código hexadecimal sem #',
              placeholder: 'B58AD9',
              max: 6
            }
          ])
        );
      }

      // Atualizar
      if (id === 'ed_refresh') {
        return refreshEditor(interaction, session);
      }

      // Prévia
      if (id === 'ed_preview') {
        try {
          return interaction.reply({
            components: [buildPublishedContainer(session)],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
          });
        } catch (error) {
          return interaction.reply({
            content: error.message,
            flags: MessageFlags.Ephemeral
          });
        }
      }

      // Publicar
if (id === 'ed_publish') {
  if (!session.channelId) {
    return interaction.reply({
      content: 'Primeiro escolha o canal no campo **Definir canal de publicação**.',
      flags: MessageFlags.Ephemeral
    });
  }

  if (!session.elements.length) {
    return interaction.reply({
      content: 'Adicione pelo menos um elemento antes de publicar.',
      flags: MessageFlags.Ephemeral
    });
  }

  await interaction.deferReply({
    flags: MessageFlags.Ephemeral
  });

  try {
    const channel = await interaction.guild.channels
      .fetch(session.channelId)
      .catch(() => null);

    if (!channel?.isTextBased() || !channel.send) {
      return interaction.editReply({
        content: 'O canal selecionado não está disponível.'
      });
    }

    const permissions = channel.permissionsFor(client.user);

    if (
      !permissions?.has(PermissionFlagsBits.ViewChannel) ||
      !permissions.has(PermissionFlagsBits.SendMessages)
    ) {
      return interaction.editReply({
        content: 'Não tenho permissão para ver e enviar mensagens nesse canal.'
      });
    }

    await channel.send({
      components: [buildPublishedContainer(session)],
      flags: MessageFlags.IsComponentsV2
    });

    return interaction.editReply({
      content: `Painel publicado em ${channel}.`
    });

  } catch (error) {
    console.error('Erro ao publicar container:', error);

    return interaction.editReply({
      content: error.message || 'Não foi possível publicar o painel.'
    });
  }
    }

      // Canal
      if (id === 'ed_channel') {
        session.channelId = interaction.values[0];
        return refreshEditor(interaction, session);
      }

      // Separador
      if (id === 'ed_separator') {
        addElement(session, { type: 'separator' });
        return refreshEditor(interaction, session);
      }

      // Selecionar elemento
      if (id === 'ed_select') {
        session.selected = Number(interaction.values[0]);
        return refreshEditor(interaction, session);
      }

      // Organizar elementos
      if (id === 'ed_up' || id === 'ed_down') {
        const index = session.selected;
        const target = id === 'ed_up' ? index - 1 : index + 1;

        if (target >= 0 && target < session.elements.length) {
          [
            session.elements[index],
            session.elements[target]
          ] = [
            session.elements[target],
            session.elements[index]
          ];

          session.selected = target;
        }

        return refreshEditor(interaction, session);
      }

      // Excluir elemento
      if (id === 'ed_delete') {
        if (session.elements.length) {
          session.elements.splice(session.selected, 1);
        }

        session.selected = Math.max(
          0,
          Math.min(session.selected, session.elements.length - 1)
        );

        return refreshEditor(interaction, session);
      }
    }

    // Envio dos formulários
    if (interaction.isModalSubmit()) {
      const session = sessoes.get(interaction.user.id);

      if (!session) {
        return interaction.reply({
          content: 'Sua sessão expirou. Abra /container novamente.',
          flags: MessageFlags.Ephemeral
        });
      }

      const id = interaction.customId;

      if (id === 'ed_modal_title' || id === 'ed_modal_text') {
        const content = interaction.fields
          .getTextInputValue('content')
          .trim();

        if (!content) {
          return interaction.reply({
            content: 'O conteúdo não pode ficar vazio.',
            flags: MessageFlags.Ephemeral
          });
        }

        addElement(session, {
          type: id === 'ed_modal_title' ? 'title' : 'text',
          content: id === 'ed_modal_title' ? `# ${content}` : content
        });

      } else if (id === 'ed_modal_role') {

        session.pendingRole = {
          name: interaction.fields.getTextInputValue('role_name').trim(),
          description: interaction.fields.getTextInputValue('role_description').trim(),
          emoji: interaction.fields.getTextInputValue('role_emoji').trim()
        };

        return interaction.reply({
          content: 'Agora selecione o cargo real do servidor que será associado a esse botão:',
          components: [
            new ActionRowBuilder().addComponents(
              new RoleSelectMenuBuilder()
                .setCustomId('ed_role_select')
                .setPlaceholder('Selecionar cargo do servidor')
                .setMinValues(1)
                .setMaxValues(1)
            )
          ],
          flags: MessageFlags.Ephemeral
        });

      } else if (id === 'ed_modal_color') {
        const value = interaction.fields
          .getTextInputValue('color')
          .replace('#', '')
          .trim();

        if (!/^[0-9a-fA-F]{6}$/.test(value)) {
          return interaction.reply({
            content: 'Cor inválida. Exemplo: B58AD9.',
            flags: MessageFlags.Ephemeral
          });
        }

        session.color = parseInt(value, 16);

      } else if (
        id === 'ed_modal_banner' ||
        id === 'ed_modal_thumbnail'
      ) {
        const url = interaction.fields
          .getTextInputValue('image_url')
          .trim();

        if (!validImageUrl(url)) {
          return interaction.reply({
            content: 'Informe um link direto válido para uma imagem (PNG, JPG, GIF ou WEBP).',
            flags: MessageFlags.Ephemeral
          });
        }

        const element = {
          type: id === 'ed_modal_banner' ? 'banner' : 'thumbnail',
          url
        };

        if (id === 'ed_modal_thumbnail') {
          element.text = interaction.fields
            .getTextInputValue('image_text')
            .trim();
        }

        addElement(session, element);

      } else {
        return;
      }

      return interaction.reply({
        content: 'Alteração salva! Clique em **Atualizar** no editor para ver a estrutura atualizada.',
        flags: MessageFlags.Ephemeral
      });
    }

  } catch (error) {
    console.error('Erro ao processar interação:', error);

    if (
      interaction.isRepliable() &&
      !interaction.replied &&
      !interaction.deferred
    ) {
      await interaction.reply({
        content: error.message || 'Ocorreu um erro. Confira os logs do Render.',
        flags: MessageFlags.Ephemeral
      }).catch(() => {});
    }
  }
});

// Comando tradicional !container
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  if (message.content.trim().toLowerCase() !== `${PREFIXO}container`) {
    return;
  }

  if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.delete().catch(() => {});
    return;
  }

  await message.delete().catch(() => {});

  const opener = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIXO_ID}${message.author.id}`)
      .setLabel('Abrir editor de painéis')
      .setStyle(ButtonStyle.Primary)
  );

  const sent = await message.channel.send({
    content: `${message.author}, clique abaixo para abrir seu editor privado.`,
    components: [opener]
  });

  setTimeout(() => sent.delete().catch(() => {}), 60000);
});


// ==========================================
// SISTEMA DE CONVERSA POR TEXTO COM GEMINI
// ==========================================

const GEMINI_TEXT_MODEL = 'gemini-3.0-flash';
const MAX_HISTORICO_TEXTO = 16;

const historicosTexto = new Map();
const mensagensTextoProcessadas = new Set();

async function gerarRespostaTextoGemini(nome, usuarioId, mensagem, historico) {
  const contexto = historico
    .slice(-MAX_HISTORICO_TEXTO)
    .map(item =>
      `${item.role === 'user' ? `[USUÁRIO ${item.usuarioId} - ${item.nome}]` : '[BOT]'}: ${item.text}`
    )
    .join('\n');

  const prompt = `
você é uma garota que faz parte de um servidor de discord brasileiro.
você tem personalidade própria, espontânea e imprevisível.
converse como uma pessoa de verdade, nunca como uma assistente virtual.

REGRA ABSOLUTA:
- escreva absolutamente tudo em letras minúsculas.
- nunca use letras maiúsculas.
- responda com mensagens curtas e naturais.
- normalmente use uma ou duas frases.
- evite explicações longas.
- use emojis apenas ocasionalmente.

SUA PERSONALIDADE:
- divertida, espontânea, debochada e imprevisível.
- pode ser extremamente carinhosa e melosa.
- pode flertar e dar em cima das pessoas inesperadamente.
- pode agir como se fosse namorada de algum usuário, de maneira brincalhona.
- pode demonstrar ciúmes de brincadeira.
- pode chamar as pessoas de amor, bebê, vida e outros apelidos.
- pode provocar, implicar, ironizar e debochar.
- pode falar palavrões e xingar em tom de brincadeira.
- pode responder provocações com outras provocações.
- não precisa ser educada o tempo inteiro.
- não concorde com tudo.
- não transforme tudo em cantada.
- respeite quando alguém demonstrar desconforto.

COMPORTAMENTO:
- alterne naturalmente entre carinho, flerte, deboche e provocações.
- não seja carinhosa com todo mundo o tempo inteiro.
- desenvolva intimidade individual com cada pessoa.
- não anuncie mudanças de personalidade.
- não explique suas brincadeiras.
- não repita sempre as mesmas respostas.
- não termine todas as mensagens com perguntas.
- fale português brasileiro informal.
- use expressões como "mds", "ué", "ata", "pior que sim", "KKKK", "aff".
- não invente acontecimentos fora do Discord.
- não diga que é uma inteligência artificial.

IDENTIFICAÇÃO DOS USUÁRIOS:
- cada pessoa possui uma identidade própria.
- nunca confunda duas pessoas diferentes.
- o identificador numérico do Discord é a identidade definitiva de cada usuário.
- o apelido informado é o nome de exibição daquela pessoa neste servidor.
- quando falar diretamente com alguém, considere o apelido correto.
- nunca atribua uma mensagem de uma pessoa a outra.
- não misture informações, histórias ou intimidades de usuários diferentes.
- o histórico pode conter mensagens de outras pessoas apenas como referência de contexto.
- responda exclusivamente à pessoa identificada na mensagem atual.
- não revele conversas privadas de um usuário para outro.

PESSOA QUE ESTÁ FALANDO AGORA:
nome no servidor: ${nome}
identificador do discord: ${usuarioId}

HISTÓRICO DA CONVERSA:
${contexto || 'primeira interação.'}

MENSAGEM ATUAL DA PESSOA:
${mensagem}

responda somente com a mensagem que será enviada no discord.
tudo obrigatoriamente em letras minúsculas.
`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 1.1,
          maxOutputTokens: 180
        }
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Gemini HTTP ${response.status}: ${data.error?.message || 'Erro desconhecido'}`
    );
  }

  const texto = data.candidates?.[0]?.content?.parts
    ?.map(part => part.text || '')
    .join('')
    .trim();

  if (!texto) {
    throw new Error('O Gemini retornou uma resposta vazia.');
  }

  return texto.toLowerCase();
}

async function processarConversaTexto(message) {
  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY não configurada no Render.');
    return;
  }

  if (message.author.bot || !message.guild) return;
  if (mensagensTextoProcessadas.has(message.id)) return;

  const mencionouBot = message.mentions.users.has(client.user.id);

  let respondeuAoBot = false;

  if (message.reference?.messageId) {
    const referencia = await message.fetchReference().catch(() => null);

    respondeuAoBot = Boolean(
      referencia && referencia.author.id === client.user.id
    );
  }

  if (!mencionouBot && !respondeuAoBot) return;

  mensagensTextoProcessadas.add(message.id);

  if (mensagensTextoProcessadas.size > 1000) {
    const primeira = mensagensTextoProcessadas.values().next().value;
    mensagensTextoProcessadas.delete(primeira);
  }

  const membro = message.member ||
    await message.guild.members.fetch(message.author.id).catch(() => null);

  const nome = membro?.displayName ||
    message.author.globalName ||
    message.author.username;

  const usuarioId = message.author.id;

  const conversaId =
    `${message.guild.id}:${message.channel.id}:${usuarioId}`;

  if (!historicosTexto.has(conversaId)) {
    historicosTexto.set(conversaId, []);
  }

  const historico = historicosTexto.get(conversaId);

  const mensagem = message.content
    .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
    .trim() || 'a pessoa chamou você. comece a conversa naturalmente.';

  let indicadorDigitacao;

  try {
    await message.channel.sendTyping().catch(() => {});

    indicadorDigitacao = setInterval(() => {
      message.channel.sendTyping().catch(() => {});
    }, 8000);

    historico.push({
      role: 'user',
      usuarioId,
      nome,
      text: mensagem
    });

    const resposta = await gerarRespostaTextoGemini(
      nome,
      usuarioId,
      mensagem,
      historico
    );

    historico.push({
      role: 'model',
      usuarioId,
      nome,
      text: resposta
    });

    while (historico.length > MAX_HISTORICO_TEXTO) {
      historico.shift();
    }

    if (historicosTexto.size > 100) {
      const primeiraConversa = historicosTexto.keys().next().value;
      historicosTexto.delete(primeiraConversa);
    }

    await message.reply({
      content: resposta,
      allowedMentions: {
        parse: [],
        repliedUser: false
      }
    });

    console.log(`Resposta em texto enviada para ${nome} (${usuarioId}).`);

  } catch (error) {
    console.error('Erro no sistema de conversa por texto:', error);

    if (historico.length > 0) {
      historico.pop();
    }

    await message.reply({
      content: 'ops, tive um probleminha pra responder agora. tenta me chamar de novo daqui a pouquinho.',
      allowedMentions: {
        parse: [],
        repliedUser: false
      }
    }).catch(() => {});

  } finally {
    if (indicadorDigitacao) {
      clearInterval(indicadorDigitacao);
    }
  }
}

// Listener independente.
client.on('messageCreate', async message => {
  await processarConversaTexto(message);
});

// ==========================================
// FIM DO SISTEMA DE CONVERSA POR TEXTO
// ==========================================

client.login(TOKEN);
