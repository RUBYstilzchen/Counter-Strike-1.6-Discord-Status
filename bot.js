const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const { GameDig } = require('gamedig');
const gamedig = new GameDig();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN || 'ТВІЙ_DISCORD_TOKEN';
const CS_SERVER_IP = process.env.CS_SERVER_IP || 'АЙПІ_СЕРВЕРА_АБО_ЛОКАЛХОСТ';
const CS_SERVER_PORT = Number(process.env.CS_SERVER_PORT || 'ПОРТ_СЕРВЕРА');
const UPDATE_INTERVAL_MS = Number(process.env.UPDATE_INTERVAL_MS || '30000');
const MAX_CONSECUTIVE_FAILURES = 3;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
let lastStatusText = null;
let consecutiveFailures = 0;

function formatServerStatus(state) {
    let realPlayersCount = 0;

    if (Array.isArray(state.players) && state.players.length > 0) {
        realPlayersCount = state.players.filter(p => !p.raw || !p.raw.bot).length;
    } else {
        const total = typeof state.numplayers === 'number' ? state.numplayers : 0;
        const bots = state.raw && typeof state.raw.bots === 'number' ? state.raw.bots : 0;
        realPlayersCount = Math.max(0, total - bots);
    }

    const maxplayers = typeof state.maxplayers === 'number' ? state.maxplayers : 0;
    const map = state.map || 'невідомо';
    
    return `Онлайн: ${realPlayersCount}/${maxplayers} | ${map}`;
}

async function setPresence(text, online = true) {
    await client.user.setPresence({
        activities: [{ name: text, type: ActivityType.Playing }],
        status: online ? 'online' : 'dnd',
    });
}

async function queryServer() {
    return gamedig.query({
        type: 'counterstrike16',
        host: CS_SERVER_IP,
        port: CS_SERVER_PORT,
        maxRetries: 2,
        socketTimeout: 5000,
        attemptTimeout: 12000,
        requestPlayers: true,
        requestPlayersRequired: false,
        givenPortOnly: true,
    });
}

async function updateStatus() {
    try {
        const state = await queryServer();
        const statusText = formatServerStatus(state);

        await setPresence(statusText, true);
        lastStatusText = statusText;
        consecutiveFailures = 0;
    } catch (error) {
        consecutiveFailures += 1;

        if (lastStatusText) {
            await setPresence(lastStatusText, true);
        }

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            await setPresence('Сервер офлайн ❌', false);
            console.log('[СТАТУС] Сервер офлайн після кількох невдалих спроб.');
        }
    }
}

client.on('ready', async () => {
    console.log(`[БОТ] Авторизовано як ${client.user.tag}`);
    await setPresence('Перевірка сервера...', true);
    await updateStatus();
    setInterval(updateStatus, UPDATE_INTERVAL_MS);
});

if (DISCORD_TOKEN === 'YOUR_DISCORD_TOKEN_HERE' || DISCORD_TOKEN === 'TOKEN HERE') {
    console.error('Помилка: не задано DISCORD_TOKEN. Встановіть його у файлі або в змінній середовища.');
    process.exit(1);
}

client.login(DISCORD_TOKEN).catch((err) => {
    console.error('Помилка логіну в Discord:', err);
    process.exit(1);
});