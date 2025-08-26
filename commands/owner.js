const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const config = require('../config');
const permissions = require('../utils/permissions');
const fs = require('fs');

const ownerCommands = {
    mode: {
        description: 'Change bot mode (private/public)',
        usage: 'mode <private/public>',
        adminOnly: true,
        execute: async (context) => {
            const { args, chatId, bot, sender } = context;

            // ✅ check if sender is allowed
            const allowed = await permissions.checkPermission(sender, chatId, true, bot);
            if (!allowed) {
                await bot.sendMessage(chatId, '❌ You are not authorized to use this command.');
                return;
            }

            if (args.length === 0) {
                const currentMode = config.get('settings').mode;
                await bot.sendMessage(chatId, `ℹ️ Current bot mode: *${currentMode}*\n\nUsage: !mode <private/public>`);
                return;
            }

            const mode = args[0].toLowerCase();

            if (mode !== 'private' && mode !== 'public') {
                await bot.sendMessage(chatId, '❌ Invalid mode. Use "private" or "public".');
                return;
            }

            const settings = config.get('settings');
            settings.mode = mode;
            settings.restrictToAdmins = (mode === 'private');

            config.updateSettings(settings);

            const modeText = mode === 'private'
                ? '🔒 Bot is now in *Private Mode*\nOnly bot owner and admins can use commands.'
                : '🌐 Bot is now in *Public Mode*\nEveryone can use bot commands.';

            await bot.sendMessage(chatId, `✅ ${modeText}`);
        }
    },

    antidelete: {
        description: 'Toggle anti-delete feature',
        usage: 'antidelete <on/off>',
        adminOnly: true,
        execute: async (context) => {
            const { args, chatId, bot, sender } = context;

            const allowed = await permissions.checkPermission(sender, chatId, true, bot);
            if (!allowed) {
                await bot.sendMessage(chatId, '❌ You are not authorized to use this command.');
                return;
            }

            if (args.length === 0) {
                const status = config.get('settings').antiDelete ? 'ON' : 'OFF';
                await bot.sendMessage(chatId, `ℹ️ Anti-delete is currently: *${status}*\n\nUsage: !antidelete <on/off>`);
                return;
            }

            const toggle = args[0].toLowerCase();
            const isOn = ['on', 'true', 'enable'].includes(toggle);

            const settings = config.get('settings');
            settings.antiDelete = isOn;
            config.updateSettings(settings);

            const statusText = isOn
                ? '🛡️ Anti-delete is now *ENABLED*'
                : '🚫 Anti-delete is now *DISABLED*';

            await bot.sendMessage(chatId, `✅ ${statusText}`);
        }
    },

    setpp: {
        description: 'Set bot profile picture',
        usage: 'setpp (reply to image)',
        adminOnly: true,
        execute: async (context) => {
            const { chatId, bot, message, sender, sock } = context;

            const allowed = await permissions.checkPermission(sender, chatId, true, sock);
            if (!allowed) {
                await bot.sendMessage(chatId, '❌ You are not authorized to use this command.');
                return;
            }

            let targetMessage = null;
            const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

            if (quotedMessage?.imageMessage) {
                targetMessage = {
                    key: message.message.extendedTextMessage.contextInfo.stanzaId,
                    message: quotedMessage
                };
            } else if (message.message?.imageMessage) {
                targetMessage = message;
            }

            if (!targetMessage) {
                await bot.sendMessage(chatId, '❌ Please reply to an image or send an image with the command.');
                return;
            }

            try {
                await bot.sendMessage(chatId, '⏳ Setting profile picture...');
                const buffer = await downloadMediaMessage(targetMessage, 'buffer', {});
                if (!buffer) {
                    await bot.sendMessage(chatId, '❌ Failed to download image.');
                    return;
                }
                await sock.updateProfilePicture(sock.user.id, buffer);
                await bot.sendMessage(chatId, '✅ Profile picture updated successfully!');
            } catch (error) {
                await bot.sendMessage(chatId, '❌ Error setting profile picture.');
            }
        }
    },

    backup: {
        description: 'Backup bot configuration',
        usage: 'backup',
        adminOnly: true,
        execute: async (context) => {
            const { chatId, bot, sender } = context;

            const allowed = await permissions.checkPermission(sender, chatId, true, bot);
            if (!allowed) {
                await bot.sendMessage(chatId, '❌ You are not authorized to use this command.');
                return;
            }

            try {
                const configData = config.get();
                const backup = JSON.stringify(configData, null, 2);

                const timestamp = new Date().toISOString().split('T')[0];
                const filename = `bot-backup-${timestamp}.json`;

                const backupPath = `./storage/${filename}`;
                fs.writeFileSync(backupPath, backup);

                const backupText = `💾 *Bot Configuration Backup*\n\n📅 Date: ${new Date().toLocaleString()}\n📁 Backup saved as: ${filename}`;

                await bot.sendMessage(chatId, backupText);
            } catch (error) {
                await bot.sendMessage(chatId, '❌ Error creating backup.');
            }
        }
    }
};

module.exports = ownerCommands;
