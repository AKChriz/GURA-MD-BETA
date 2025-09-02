const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const mediaUtils = require('../utils/media');
const config = require('../config');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');  // 👈 static binary
const fs = require('fs');
const path = require('path');


const mediaCommands = {
    download: {
        description: 'Download media from replied message',
        usage: 'download',
        aliases: ["vv"],
        adminOnly: false,
        execute: async (context) => {
            const { chatId, bot, message } = context;
            
            // Check if replying to a message
            const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quotedMessage) {
                await bot.sendMessage(chatId, '❌ Please reply to a message containing media.');
                return;
            }
            
            try {
                // Check if quoted message has media
                const hasMedia = quotedMessage.imageMessage || 
                               quotedMessage.videoMessage || 
                               quotedMessage.audioMessage || 
                               quotedMessage.documentMessage;
                
                if (!hasMedia) {
                    await bot.sendMessage(chatId, '❌ The replied message does not contain any media.');
                    return;
                }
                
                await bot.sendMessage(chatId, '⏳ Downloading media...');
                
                // Create a fake message object for download
                const fakeMessage = {
                    key: message.message.extendedTextMessage.contextInfo.stanzaId,
                    message: quotedMessage
                };
                
                const buffer = await downloadMediaMessage(fakeMessage, 'buffer', {});
                
                if (!buffer) {
                    await bot.sendMessage(chatId, '❌ Failed to download media.');
                    return;
                }
                
                // Check file size
                if (buffer.length > config.get('mediaDownloadLimit')) {
                    await bot.sendMessage(chatId, '❌ Media file is too large to download.');
                    return;
                }
                
                // Determine media type and send
                if (quotedMessage.imageMessage) {
                    await bot.sendImage(chatId, buffer, '📥 Downloaded Image');
                } else if (quotedMessage.videoMessage) {
                    await bot.sendVideo(chatId, buffer, '📥 Downloaded Video');
                } else if (quotedMessage.audioMessage) {
                    await bot.sendAudio(chatId, buffer);
                } else if (quotedMessage.documentMessage) {
                    await bot.sendMessage(chatId, '📥 Document downloaded successfully.');
                }
                
            } catch (error) {
                console.error('Download error:', error);
                await bot.sendMessage(chatId, '❌ Error downloading media.');
            }
        }
    },
    
    sticker: {
        description: 'Convert image to sticker',
        usage: 'sticker (reply to image)',
        aliases: ["s"],
        adminOnly: false,
        execute: async (context) => {
            const { chatId, bot, message, sock } = context;
            
            let targetMessage = null;
            
            // Check if replying to a message with image
            const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (quotedMessage?.imageMessage) {
                targetMessage = {
                    key: message.message.extendedTextMessage.contextInfo.stanzaId,
                    message: quotedMessage
                };
            } 
            // Check if current message has image
            else if (message.message?.imageMessage) {
                targetMessage = message;
            }
            
            if (!targetMessage) {
                await bot.sendMessage(chatId, '❌ Please reply to an image or send an image with the sticker command.');
                return;
            }
            
            try {
                await bot.sendMessage(chatId, '⏳ Converting to sticker...');
                
                const buffer = await downloadMediaMessage(targetMessage, 'buffer', {});
                
                if (!buffer) {
                    await bot.sendMessage(chatId, '❌ Failed to download image.');
                    return;
                }
                
                // Process image for sticker
                const stickerBuffer = await mediaUtils.processImageForSticker(buffer);
                
                if (!stickerBuffer) {
                    await bot.sendMessage(chatId, '❌ Failed to process image for sticker.');
                    return;
                }
                
                // Send as sticker
                await sock.sendMessage(chatId, {
                    sticker: stickerBuffer
                });
                
            } catch (error) {
                console.error('Sticker error:', error);
                await bot.sendMessage(chatId, '❌ Error creating sticker.');
            }
        }
    },

    toimg: {
        description: 'Convert quoted sticker to image',
        usage: 'toimg (reply to a sticker)',
        aliases: ["topicture", "tophoto"],
        adminOnly: false,
        execute: async (context) => {
            const { bot, chatId, message } = context;

            try {
                // get the quoted message
                const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

                if (!quoted || !quoted.stickerMessage) {
                    return await bot.sendMessage(chatId, '❌ Please reply to a *sticker* with this command.');
                }

                // download sticker as buffer
                const buffer = await downloadMediaMessage(
                    { message: quoted },
                    'buffer',
                    {}
                );

                // send as image using wrapper
                await bot.sendImage(chatId, buffer, '✅ Sticker converted to image \n> 𝙶𝚄𝚁𝙰-𝙼𝙳');

            } catch (err) {
                console.error('toimg command error:', err);
                await bot.sendMessage(chatId, '⚠️ Failed to convert sticker to image.');
            }
        }
    }, 

    tomp3: {
        description: 'Convert quoted video to audio (mp3)',
        usage: 'tomp3 (reply to a video)',
        adminOnly: false,
        execute: async (context) => {
            const { bot, chatId, message } = context;

            try {
                // get quoted message
                const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

                if (!quoted || !quoted.videoMessage) {
                    return await bot.sendMessage(chatId, '❌ Please reply to a *video* with this command.');
                }

                // download quoted video
                const buffer = await downloadMediaMessage(
                    { message: quoted },
                    'buffer',
                    {}
                );

                // save temp video
                const inputPath = path.join(__dirname, 'temp_video.mp4');
                const outputPath = path.join(__dirname, 'temp_audio.mp3');
                fs.writeFileSync(inputPath, buffer);

                // convert with ffmpeg
                await new Promise((resolve, reject) => {
                    ffmpeg(inputPath)
                        .setFfmpegPath(ffmpegPath)
                        .output(outputPath)
                        .on('end', resolve)
                        .on('error', reject)
                        .run();
                });

                // read converted audio
                const audioBuffer = fs.readFileSync(outputPath);

                // send via wrapper
                await bot.sendAudio(chatId, audioBuffer);

                // cleanup
                fs.unlinkSync(inputPath);
                fs.unlinkSync(outputPath);

            } catch (err) {
                console.error('tomp3 command error:', err);
                await bot.sendMessage(chatId, '⚠️ Failed to convert video to audio.');
            }
        }
    }

}

module.exports = mediaCommands;
