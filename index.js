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
    StringSelectMenuBuilder,
    ChannelType
} = require('discord.js');

const { joinVoiceChannel } = require('@discordjs/voice');
const express = require('express');

// ==========================================
// MINI SITE
// ==========================================

const app = express();

app.get('/', (req, res) => {
    res.send('Ayko online!');
});

app.listen(3000, () => {
    console.log('Servidor web online na porta 3000');
});

// ==========================================
// CONFIGURAÇÕES
// ==========================================

const TOKEN = process.env.DISCORD_TOKEN;
const SERVIDOR_ID = '920817412050403399';
const CANAL_VOZ_ID = '1540757131144208444';
const PREFIXO = '!';

// ==========================================
// CLIENTE
// ==========================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Cada usuário terá sua própria sessão de edição.
const sessoes = new Map();

// ==========================================
// COMANDO SLASH
// ==========================================

const comandos = [
    new SlashCommandBuilder()
        .setName('container')
        .setDescription('Abrir o editor profissional de Containers V2')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
];

async function registrarComandos() {
    const rest = new REST({ version: '10' }).setToken(TOKEN);

    await rest.put(
        Routes.applicationGuildCommands(client.user.id, SERVIDOR_ID),
        { body: comandos.map(c => c.toJSON()) }
    );

    console.log('Comandos registrados!');
}

// ==========================================
// CORES E FUNÇÕES AUXILIARES
// ==========================================

const COR_PADRAO = 0xB58AD9;

function criarBotao(id, label, style = ButtonStyle.Secondary, emoji) {
    const botao = new ButtonBuilder()
        .setCustomId(id)
        .setLabel(label)
        .setStyle(style);

    if (emoji) botao.setEmoji(emoji);

    return botao;
}

function criarModal(id, titulo, campos) {
    const modal = new ModalBuilder()
        .setCustomId(id)
        .setTitle(titulo);

    for (const campo of campos) {
        const input = new TextInputBuilder()
            .setCustomId(campo.id)
            .setLabel(campo.label)
            .setStyle(campo.multiline ? TextInputStyle.Paragraph : TextInputStyle.Short)
            .setRequired(campo.required !== false)
            .setMaxLength(campo.max || 1000);

        if (campo.placeholder) input.setPlaceholder(campo.placeholder);

        if (campo.value) input.setValue(campo.value);

        modal.addComponents(
            new ActionRowBuilder().addComponents(input)
        );
    }

    return modal;
}

function sessaoDoUsuario(userId) {
    if (!sessoes.has(userId)) {
        sessoes.set(userId, {
            cor: COR_PADRAO,
            elementos: [],
            selecionado: 0
        });
    }

    return sessoes.get(userId);
}

// ==========================================
// MONTAR CONTAINER
// ==========================================

function montarContainer(sessao) {
    const container = new ContainerBuilder()
        .setAccentColor(sessao.cor);

    for (const item of sessao.elementos) {
        if (item.tipo === 'titulo' || item.tipo === 'texto') {
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(item.conteudo)
            );
        }

        if (item.tipo === 'banner') {
            container.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems({
                    media: { url: item.url }
                })
            );
        }

        if (item.tipo === 'thumbnail') {
            container.addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(item.texto || ' ')
                    )
                    .setThumbnailAccessory(
                        new ThumbnailBuilder({
                            media: { url: item.url }
                        })
                    )
            );
        }

        if (item.tipo === 'separador') {
            container.addSeparatorComponents(
                new SeparatorBuilder()
                    .setDivider(true)
                    .setSpacing(SeparatorSpacingSize.Large)
            );
        }
    }

    return container;
}

// ==========================================
// PAINEL DO EDITOR
// ==========================================

function montarPainel(user, sessao) {
    const container = new ContainerBuilder()
        .setAccentColor(sessao.cor)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '# ✦ AYKO — CONTAINER STUDIO\n' +
                `*Editor de Components V2*\n\n` +
                `**Criador:** ${user}\n` +
                `**Elementos:** ${sessao.elementos.length}\n` +
                `**Cor:** #${sessao.cor.toString(16).padStart(6, '0').toUpperCase()}`
            )
        )
        .addSeparatorComponents(
            new SeparatorBuilder()
                .setDivider(true)
                .setSpacing(SeparatorSpacingSize.Large)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '### ✧ Adicionar elementos\n' +
                'Escolha o tipo de componente que deseja inserir no seu Container.'
            )
        )
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                criarBotao('cv2_add_titulo', 'Título', ButtonStyle.Primary),
                criarBotao('cv2_add_texto', 'Texto', ButtonStyle.Primary),
                criarBotao('cv2_add_banner', 'Banner', ButtonStyle.Secondary),
                criarBotao('cv2_add_thumb', 'Thumbnail', ButtonStyle.Secondary),
                criarBotao('cv2_add_sep', 'Separador', ButtonStyle.Secondary)
            )
        )
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                criarBotao('cv2_cor', 'Alterar cor', ButtonStyle.Secondary),
                criarBotao('cv2_preview', 'Prévia', ButtonStyle.Success),
                criarBotao('cv2_publicar', 'Publicar', ButtonStyle.Success)
            )
        )
        .addSeparatorComponents(
            new SeparatorBuilder()
                .setDivider(true)
                .setSpacing(SeparatorSpacingSize.Large)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '### ✧ Gerenciar elementos\n' +
                (sessao.elementos.length
                    ? sessao.elementos.map((e, i) =>
                        `${i === sessao.selecionado ? '🔹' : '▫️'} **${i + 1}. ${e.tipo.toUpperCase()}**`
                    ).join('\n')
                    : '*Nenhum elemento adicionado ainda.*')
            )
        );

    if (sessao.elementos.length) {
        const opcoes = sessao.elementos.slice(0, 25).map((e, i) => ({
            label: `${i + 1}. ${e.tipo}`,
            value: String(i),
            description: e.conteudo
                ? e.conteudo.slice(0, 80)
                : e.url
                    ? e.url.slice(0, 80)
                    : 'Componente visual'
        }));

        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('cv2_selecionar')
                    .setPlaceholder('Selecione um elemento para organizar')
                    .addOptions(opcoes)
            )
        );

        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                criarBotao('cv2_subir', '↑ Subir'),
                criarBotao('cv2_descer', '↓ Descer'),
                criarBotao('cv2_excluir', 'Excluir', ButtonStyle.Danger)
            )
        );
    }

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            '-# AYKO STUDIO • Seu espaço de criação'
        )
    );

    return container;
}

// ==========================================
// ABRIR EDITOR
// ==========================================

async function abrirCriador(interactionOuMessage) {
    const user = interactionOuMessage.user || interactionOuMessage.author;
    const sessao = {
        cor: COR_PADRAO,
        elementos: [],
        selecionado: 0
    };

    sessoes.set(user.id, sessao);

    const painel = montarPainel(user, sessao);

    if (interactionOuMessage.isChatInputCommand?.()) {
        await interactionOuMessage.reply({
            components: [painel],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
    } else {
        await interactionOuMessage.reply({
            components: [painel],
            flags: MessageFlags.IsComponentsV2
        });
    }
}

// ==========================================
// ATUALIZAR PAINEL
// ==========================================

async function atualizarPainel(interaction, sessao) {
    const painel = montarPainel(interaction.user, sessao);

    await interaction.update({
        components: [painel],
        flags: MessageFlags.IsComponentsV2
    });
}

// ==========================================
// INTERAÇÕES
// ==========================================

client.on('interactionCreate', async interaction => {
    try {
        // COMANDO SLASH
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'container') {
                await abrirCriador(interaction);
            }
            return;
        }

        // BOTÕES E MENUS
        if (interaction.isButton() || interaction.isStringSelectMenu()) {
            const sessao = sessoes.get(interaction.user.id);

            if (!sessao) {
                return interaction.reply({
                    content: 'Sua sessão expirou. Abra /container novamente.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const id = interaction.customId;

            // ADICIONAR TÍTULO
            if (id === 'cv2_add_titulo') {
                return interaction.showModal(
                    criarModal('cv2_modal_titulo', 'Adicionar título', [
                        {
                            id: 'conteudo',
                            label: 'Texto do título',
                            placeholder: 'Digite seu título...',
                            max: 4000
                        }
                    ])
                );
            }

            // ADICIONAR TEXTO
            if (id === 'cv2_add_texto') {
                return interaction.showModal(
                    criarModal('cv2_modal_texto', 'Adicionar texto', [
                        {
                            id: 'conteudo',
                            label: 'Descrição',
                            placeholder: 'Escreva seu conteúdo...',
                            multiline: true,
                            max: 4000
                        }
                    ])
                );
            }

            // ADICIONAR BANNER
            if (id === 'cv2_add_banner') {
                return interaction.showModal(
                    criarModal('cv2_modal_banner', 'Adicionar banner', [
                        {
                            id: 'url',
                            label: 'Link direto da imagem',
                            placeholder: 'https://...',
                            max: 1000
                        }
                    ])
                );
            }

            // ADICIONAR THUMBNAIL
            if (id === 'cv2_add_thumb') {
                return interaction.showModal(
                    criarModal('cv2_modal_thumb', 'Adicionar thumbnail', [
                        {
                            id: 'url',
                            label: 'Link direto da imagem',
                            placeholder: 'https://...',
                            max: 1000
                        },
                        {
                            id: 'texto',
                            label: 'Texto ao lado da imagem',
                            placeholder: 'Descrição opcional...',
                            required: false,
                            max: 1000
                        }
                    ])
                );
            }

            // ALTERAR COR
            if (id === 'cv2_cor') {
                return interaction.showModal(
                    criarModal('cv2_modal_cor', 'Cor do Container', [
                        {
                            id: 'cor',
                            label: 'Código hexadecimal (sem #)',
                            placeholder: 'B58AD9',
                            max: 6
                        }
                    ])
                );
            }

            // PRÉVIA
            if (id === 'cv2_preview') {
                const preview = montarContainer(sessao);

                return interaction.reply({
                    components: [preview],
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
                });
            }

            // PUBLICAR
            if (id === 'cv2_publicar') {
                return interaction.showModal(
                    criarModal('cv2_modal_publicar', 'Publicar Container', [
                        {
                            id: 'canal',
                            label: 'ID do canal de destino',
                            placeholder: 'Cole o ID do canal aqui...',
                            max: 25
                        }
                    ])
                );
            }

            // ADICIONAR SEPARADOR
            if (id === 'cv2_add_sep') {
                sessao.elementos.push({ tipo: 'separador' });
                sessao.selecionado = sessao.elementos.length - 1;
                return atualizarPainel(interaction, sessao);
            }

            // SELECIONAR ELEMENTO
            if (id === 'cv2_selecionar') {
                sessao.selecionado = Number(interaction.values[0]);
                return atualizarPainel(interaction, sessao);
            }

            // MOVER ELEMENTO PARA CIMA
            if (id === 'cv2_subir') {
                const i = sessao.selecionado;

                if (i > 0) {
                    [sessao.elementos[i - 1], sessao.elementos[i]] =
                        [sessao.elementos[i], sessao.elementos[i - 1]];

                    sessao.selecionado--;
                }

                return atualizarPainel(interaction, sessao);
            }

            // MOVER ELEMENTO PARA BAIXO
            if (id === 'cv2_descer') {
                const i = sessao.selecionado;

                if (i < sessao.elementos.length - 1) {
                    [sessao.elementos[i + 1], sessao.elementos[i]] =
                        [sessao.elementos[i], sessao.elementos[i + 1]];

                    sessao.selecionado++;
                }

                return atualizarPainel(interaction, sessao);
            }

            // EXCLUIR ELEMENTO
            if (id === 'cv2_excluir') {
                sessao.elementos.splice(sessao.selecionado, 1);
                sessao.selecionado = Math.max(
                    0,
                    sessao.elementos.length - 1
                );

                return atualizarPainel(interaction, sessao);
            }
        }

        // FORMULÁRIOS
        if (interaction.isModalSubmit()) {
            const sessao = sessoes.get(interaction.user.id);

            if (!sessao) {
                return interaction.reply({
                    content: 'Sua sessão expirou. Abra /container novamente.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const id = interaction.customId;

            if (id === 'cv2_modal_titulo') {
                const conteudo = interaction.fields.getTextInputValue('conteudo');

                sessao.elementos.push({
                    tipo: 'titulo',
                    conteudo: `# ${conteudo}`
                });
            }

            if (id === 'cv2_modal_texto') {
                const conteudo = interaction.fields.getTextInputValue('conteudo');

                sessao.elementos.push({
                    tipo: 'texto',
                    conteudo
                });
            }

            if (id === 'cv2_modal_banner') {
                const url = interaction.fields.getTextInputValue('url');

                if (!/^https?:\/\/.+\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(url)) {
                    return interaction.reply({
                        content: 'Informe um link direto de imagem PNG, JPG, GIF ou WEBP.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                sessao.elementos.push({ tipo: 'banner', url });
            }

            if (id === 'cv2_modal_thumb') {
                const url = interaction.fields.getTextInputValue('url');
                const texto = interaction.fields.getTextInputValue('texto');

                if (!/^https?:\/\/.+\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(url)) {
                    return interaction.reply({
                        content: 'Informe um link direto de imagem PNG, JPG, GIF ou WEBP.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                sessao.elementos.push({
                    tipo: 'thumbnail',
                    url,
                    texto
                });
            }

            if (id === 'cv2_modal_cor') {
                const valor = interaction.fields
                    .getTextInputValue('cor')
                    .replace('#', '')
                    .trim();

                if (!/^[0-9a-fA-F]{6}$/.test(valor)) {
                    return interaction.reply({
                        content: 'Código inválido. Exemplo: B58AD9.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                sessao.cor = parseInt(valor, 16);
            }

            if (id === 'cv2_modal_publicar') {
                const canalId = interaction.fields
                    .getTextInputValue('canal')
                    .trim();

                const canal = await interaction.guild.channels.fetch(canalId)
                    .catch(() => null);

                if (!canal || !canal.isTextBased() ||
                    canal.type === ChannelType.GuildCategory) {
                    return interaction.reply({
                        content: 'Não encontrei um canal de texto válido com esse ID.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (!canal.permissionsFor(client.user).has([
                    'ViewChannel',
                    'SendMessages'
                ])) {
                    return interaction.reply({
                        content: 'Não tenho permissão para enviar mensagens nesse canal.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (!sessao.elementos.length) {
                    return interaction.reply({
                        content: 'Adicione pelo menos um elemento antes de publicar.',
                        flags: MessageFlags.Ephemeral
 
