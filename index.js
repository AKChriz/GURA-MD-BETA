const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys'); 
const pino = require('pino');
const qrcode = require('qrcode-terminal'); 
const Bot = require('./bot');
const config = require('./config');
const express = require("express");
const fs = require("fs");
const { Boom } = require('@hapi/boom');
const MessageQueue = require("./utils/queue"); // ✅ import queue

async function startBot() {
    try {
        console.log('🤖 Starting WhatsApp Bot...');

        const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })),
            },
            logger: pino({ level: 'silent' }),
            syncFullHistory: false,
            browser: ['Ubuntu', 'Chrome', '20.0.04'],
            generateHighQualityLinkPreview: true,
        });

        // ✅ init queue
        const msgQueue = new MessageQueue(sock, 1000);

        // Pass both sock + queue into bot
        const bot = new Bot(sock, msgQueue);

        sock.ev.on('creds.update', saveCreds);

        // --- Connection Handling ---
        sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
            if (qr) {
                console.log('\n📱 Scan this QR code with WhatsApp:');
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'close') {
                const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
                console.info('Connection closed. Code:', reason);

                if (reason === DisconnectReason.badSession) {
                    console.log("❌ Bad session detected. Deleting session folder...");
                    fs.rmSync("./auth_info", { recursive: true, force: true });
                    return startBot();
                }

                if (reason === DisconnectReason.loggedOut) {
                    console.log("🚪 Logged out. Not reconnecting.");
                    return;
                }

                if (!sock.__reconnectTried) {
                    sock.__reconnectTried = true;
                    console.log("⚡ Reconnecting (once)...");
                    startBot();
                } else {
                    console.log("⛔ Reconnection disabled after first attempt.");
                }

            } else if (connection === 'open') {
                console.info('✅ WhatsApp bot connected successfully!');

                const owners = config.ownerNumber || [];
                if (owners.length > 0 && !sock.__welcomeSent) {
                    const firstOwner = owners[0];
                    const msg = `✅ *Bot Connected!*\n\n` +
                        `🤖 WhatsApp Bot is online\n` +
                        `⏰ Connected at: ${new Date().toLocaleString()}\n` +
                        `📱 Status: Ready\n\n` +
                        `Type ${config.prefix}help for commands.`;

                    try {
                        // ✅ use queue instead of direct send
                        await msgQueue.sendMessage(firstOwner, { text: msg });
                        console.info(`✅ Success message sent to first owner: ${firstOwner}`);
                        sock.__welcomeSent = true; // prevent spamming
                    } catch (err) {
                        console.error(`❌ Failed to send message to ${firstOwner}:`, err);
                    }
                }
            }
        });

        // --- Message Handling ---
        sock.ev.on('messages.upsert', async (m) => {
            try {
                const msg = m.messages[0];
                if (!msg.message) return;
                if (msg.key.fromMe) return;
                if (msg.message.protocolMessage) return;

                await bot.handleMessage(m); // bot internally should use queue

            } catch (err) {
                if (String(err).includes("Bad MAC")) {
                    console.log("⚠️ Bad MAC detected. Clearing session...");
                    fs.rmSync("./auth_info", { recursive: true, force: true });
                    return startBot();
                }
                console.error("❌ Error handling message:", err.message || err);
            }
        });

        // 🚫 Removed auto group event listeners
        // sock.ev.on('groups.update', ...) 
        // sock.ev.on('group-participants.update', ...)

    } catch (error) {
        console.error('❌ Error starting bot:', error);
    }
}

// === Keep Alive Server ===
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("✅ Gura-MD bot is alive!");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Keep-alive server running on port ${PORT}`);
  startBot();
});