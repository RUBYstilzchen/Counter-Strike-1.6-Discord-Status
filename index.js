const path = require('path');
// Завантажуємо змінні середовища з конкретної папки config
require('dotenv').config({ path: path.join(__dirname, 'config', '.env') });

const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const { GameDig } = require('gamedig');
const gamedig = new GameDig();

// Зчитування конфігурації (якщо в .env пусто, спрацюють дефолтні значення, крім токена і ID)
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ADMIN_DISCORD_ID = process.env.ADMIN_DISCORD_ID;
const CS_SERVER_IP = process.env.CS_SERVER_IP || '127.0.0.1';
const CS_SERVER_PORT = Number(process.env.CS_SERVER_PORT || '27015');
const UPDATE_INTERVAL_MS = Number(process.env.UPDATE_INTERVAL_MS || '30000');
const MAX_CONSECUTIVE_FAILURES = 3;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
let lastStatusText = null;
let consecutiveFailures = 0;
let isOfflineNotified = false;

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

async function sendDirectMessage(message) {
    if (!ADMIN_DISCORD_ID) return;
    try {
        const user = await client.users.fetch(ADMIN_DISCORD_ID);
        await user.send(message);
    } catch (error) {
        console.error(`[ПОМИЛКА] Не вдалося надіслати повідомлення користувачу ${ADMIN_DISCORD_ID}:`, error.message);
    }
}

async function updateStatus() {
    try {
        const state = await queryServer();
        const statusText = formatServerStatus(state);

        await setPresence(statusText, true);
        lastStatusText = statusText;
        consecutiveFailures = 0;

        if (isOfflineNotified) {
            isOfflineNotified = false;
            await sendDirectMessage(`🟢 **Сервер знову онлайн!**\nПоточний статус: ${statusText}`);
        }
    } catch (error) {
        consecutiveFailures += 1;

        if (lastStatusText) {
            await setPresence(lastStatusText, true);
        }

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            await setPresence('Сервер офлайн ❌', false);
            console.log('[СТАТУС] Сервер офлайн після кількох невдалих спроб.');

            if (!isOfflineNotified) {
                isOfflineNotified = true;
                await sendDirectMessage(`🔴 **Увага! Сервер офлайн!** ❌\nIP: \`${CS_SERVER_IP}:${CS_SERVER_PORT}\` не відповідає.`);
            }
        }
    }
}

client.on('ready', async () => {
    console.log(`[БОТ] Авторизовано як ${client.user.tag}`);
    await setPresence('Перевірка сервера...', true);
    await updateStatus();
    setInterval(updateStatus, UPDATE_INTERVAL_MS);
});

// Перевірка обов'язкових налаштувань перед запуском
if (!DISCORD_TOKEN) {
    console.error('Помилка: DISCORD_TOKEN не задано у файлі config/.env');
    process.exit(1);
}
if (!ADMIN_DISCORD_ID) {
    console.warn('Попередження: ADMIN_DISCORD_ID не задано. Сповіщення в приват не надходитимуть.');
}

client.login(DISCORD_TOKEN).catch((err) => {
    console.error('Помилка логіну в Discord:', err);
    process.exit(1);
});