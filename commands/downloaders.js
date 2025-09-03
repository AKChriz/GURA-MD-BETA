const ytdl = require('ytdl-core');
const ytSearch = require('yt-search');
const axios = require("axios");
const { igdl } = require('ruhend-scraper');
const yts = require('yt-search');
const fs = require('fs');
const path = require('path');


const princeVideoApi = {
    base: 'https://api.princetechn.com/api/download/ytmp4',
    apikey: process.env.PRINCE_API_KEY || 'prince',
    async fetchMeta(videoUrl) {
        const params = new URLSearchParams({ apikey: this.apikey, url: videoUrl });
        const url = `${this.base}?${params.toString()}`;
        const { data } = await axios.get(url, { timeout: 20000, headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' } });
        return data;
    }
};

const streamToBuffer = (stream) => new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
});

const downloaderCommands = {
    play: {
        description: "Play or download a YouTube song as MP3",
        usage: "play <song name>",
        aliases: ["song", "music", "ytmp3"],
        adminOnly: false,
        execute: async (context) => {
            const { args, chatId, sock, message } = context;

            const searchQuery = args.join(" ").trim();
            if (!searchQuery) {
                return await sock.sendMessage(
                    chatId,
                    { text: "🎶 What song do you want to download?" },
                    { quoted: message }
                );
            }

            try {
                // 🔎 Search on YouTube
                const { videos } = await yts(searchQuery);
                if (!videos || videos.length === 0) {
                    return await sock.sendMessage(
                        chatId,
                        { text: "❌ No songs found!" },
                        { quoted: message }
                    );
                }

                // ⏳ Notify user
                await sock.sendMessage(
                    chatId,
                    { text: "_Please wait, your download is in progress..._" },
                    { quoted: message }
                );

                // 🎥 First video result
                const video = videos[0];
                const urlYt = video.url;

                // 🎧 Fetch MP3 download link
                const response = await axios.get(
                    `https://apis-keith.vercel.app/download/dlmp3?url=${urlYt}`
                );
                const data = response.data;

                if (!data || !data.status || !data.result || !data.result.downloadUrl) {
                    return await sock.sendMessage(
                        chatId,
                        { text: "⚠️ Failed to fetch audio. Please try again later." },
                        { quoted: message }
                    );
                }

                const audioUrl = data.result.downloadUrl;
                const title = data.result.title;

                // 🎵 Send MP3 audio
                await sock.sendMessage(
                    chatId,
                    {
                        audio: { url: audioUrl },
                        mimetype: "audio/mpeg",
                        fileName: `${title}.mp3`,
                        ptt: false // set true if you want it as voice note
                    },
                    { quoted: message }
                );

            } catch (error) {
                console.error("❌ Error in play command:", error);
                await sock.sendMessage(
                    chatId,
                    { text: "⚠️ Download failed. Please try again later." },
                    { quoted: message }
                );
            }
        }
    },

    facebook: {
        description: 'Download Facebook videos',
        usage: 'fb <url>',
        aliases: ['fb', 'facebookdl'],
        adminOnly: false,
        execute: async (context) => {
            const { sock, chatId, message, args } = context;

            try {
                const url = args[0];

                if (!url) {
                    return await sock.sendMessage(chatId, {
                        text: "❌ Please provide a Facebook video URL.\nExample: !fb https://www.facebook.com/..."
                    }, { quoted: message });
                }

                if (!url.includes('facebook.com')) {
                    return await sock.sendMessage(chatId, {
                        text: "❌ That is not a valid Facebook link."
                    }, { quoted: message });
                }

                // React while loading
                await sock.sendMessage(chatId, {
                    react: { text: '🔄', key: message.key }
                });

                // Fetch video data from API
                const response = await axios.get(`https://api.dreaded.site/api/facebook?url=${url}`);
                const data = response.data;

                if (!data || data.status !== 200 || !data.facebook || !data.facebook.sdVideo) {
                    return await sock.sendMessage(chatId, {
                        text: "⚠️ API didn’t respond correctly. Try again later!"
                    }, { quoted: message });
                }

                const fbvid = data.facebook.sdVideo;

                if (!fbvid) {
                    return await sock.sendMessage(chatId, {
                        text: "❌ Wrong Facebook data. Ensure the video exists."
                    }, { quoted: message });
                }

                // Temp directory
                const tmpDir = path.join(process.cwd(), 'tmp');
                if (!fs.existsSync(tmpDir)) {
                    fs.mkdirSync(tmpDir, { recursive: true });
                }

                const tempFile = path.join(tmpDir, `fb_${Date.now()}.mp4`);

                // Download video
                const videoResponse = await axios({
                    method: 'GET',
                    url: fbvid,
                    responseType: 'stream',
                    headers: {
                        'User-Agent': 'Mozilla/5.0',
                        'Accept': 'video/mp4,video/*;q=0.9,*/*;q=0.8',
                        'Range': 'bytes=0-',
                        'Referer': 'https://www.facebook.com/'
                    }
                });

                const writer = fs.createWriteStream(tempFile);
                videoResponse.data.pipe(writer);

                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });

                if (!fs.existsSync(tempFile) || fs.statSync(tempFile).size === 0) {
                    throw new Error('Failed to download video');
                }

                // Send video
                await sock.sendMessage(chatId, {
                    video: { url: tempFile },
                    mimetype: "video/mp4",
                    caption: "> *𝙶𝚄𝚁𝙰-𝙼𝙳*"
                }, { quoted: message });

                // Clean up
                try {
                    fs.unlinkSync(tempFile);
                } catch (err) {
                    console.error('Error cleaning temp file:', err);
                }

            } catch (err) {
                console.error("❌ Error in Facebook command:", err);
                await sock.sendMessage(chatId, {
                    text: "⚠️ Error occurred. API might be down.\nError: " + err.message
                }, { quoted: message });
            }
        }
    },

    instagram: {
        description: 'Download Instagram videos from a link',
        usage: 'ig <url>',
        aliases: ["ig"],
        adminOnly: false,
        execute: async (context) => {
            const { args, chatId, bot, sock, message } = context;
            const url = args[0];

            if (!url) {
                return bot.sendMessage(chatId, '❌ Please provide a valid Instagram link.');
            }

            try {
                let mediaUrls = [];
                let caption = '';

                // --- Primary: Ruhend scraper ---
                try {
                    const res = await igdl(url);
                    const data = await res.data;

                    if (Array.isArray(data) && data.length > 0) {
                        mediaUrls = data.map(media => media.url).filter(u => typeof u === 'string');
                    } else {
                        throw new Error('No media returned by igdl');
                    }
                } catch (err) {
                    console.error('ruhend-scraper failed, using fallback:', err.message);

                    // --- Fallback: Dreaded API ---
                    const res2 = await fetch(`https://api.dreaded.site/api/igdl?url=${encodeURIComponent(url)}`);
                    const data2 = await res2.json();

                    if (data2.success && Array.isArray(data2.result?.url) && data2.result.url.length) {
                        mediaUrls = data2.result.url;
                        caption = data2.result.metadata?.caption || '';
                    } else {
                        throw new Error('Fallback API did not return media');
                    }
                }
                // --- Send each media item ---
                for (const mediaUrl of mediaUrls) {
                    try {
                        const mediaRes = await fetch(mediaUrl);
                        const buffer = Buffer.from(await mediaRes.arrayBuffer());

                        await sock.sendMessage(chatId, {
                            video: buffer,
                            mimetype: "video/mp4",
                            caption: caption || "🎥 Instagram Video \n> *𝙶𝚄𝚁𝙰-𝙼𝙳*"
                        }, { quoted: message });
                    } catch (err) {
                        console.error("❌ Failed to send IG video:", err.message);
                    }
                }
            } catch (error) {
                console.error('Instagram command error:', error);
                await bot.sendMessage(chatId, '⚠️ Could not fetch Instagram media. Please try again later.');
            }
        }
    },

    tiktok: {
        description: 'Download TikTok videos from a link',
        usage: 'tiktok <url>',
        aliases: ["tt"],
        adminOnly: false,
        execute: async (context) => {
            const { args, chatId, bot, sock} = context;
            const url = args[0];

            if (!url) {
                return bot.sendMessage(chatId, '❌ Please provide a TikTok link.');
            }

            try {
                let videoUrl, captionText, dreadedData;

                // --- Primary: Dreaded API ---
                const dreadedRes = await fetch(`https://api.dreaded.site/api/tiktok?url=${encodeURIComponent(url)}`);
                dreadedData = await dreadedRes.json();

                if (dreadedData?.success && dreadedData?.tiktok?.video) {
                    videoUrl = dreadedData.tiktok.video;
                    captionText = `🎶 TikTok Video\n\n📝 ${dreadedData.tiktok.description || ""}\n👤 ${dreadedData.tiktok.author?.nickname || "Unknown"}`;
                }

                // --- Fallback: GiftedTech API ---
                if (!videoUrl) {
                    const giftedRes = await fetch(`https://api.giftedtech.web.id/api/download/tiktokdlv4?apikey=gifted&url=${encodeURIComponent(url)}`);
                    const giftedData = await giftedRes.json();

                    if (giftedData?.success && giftedData?.result) {
                        videoUrl = giftedData.result.video_no_watermark || giftedData.result.videoUrl || giftedData.result.video;
                        captionText = `🎶 TikTok Video\n\n📝 ${giftedData.result.desc || ""}`;
                    }
                }

                if (!videoUrl) {
                    return bot.sendMessage(chatId, "❌ Could not fetch TikTok video.");
                }

                // --- Download the video ---
                const videoRes = await fetch(videoUrl, {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36",
                        "Referer": "https://www.tiktok.com/"
                    },
                    redirect: "follow"
                });

                if (!videoRes.ok) {
                    console.error("❌ Failed to fetch video:", videoRes.status, videoRes.statusText);
                    return bot.sendMessage(chatId, "⚠️ Video URL expired or blocked.");
                }

                const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
                if (videoBuffer.length === 0) {
                    return bot.sendMessage(chatId, "⚠️ Downloaded video is empty.");
                }

                // --- Send the video ---
                await sock.sendMessage(chatId, {
                    video: videoBuffer,
                    mimetype: "video/mp4",
                    caption: captionText || "🎶 TikTok Video \n> 𝙶𝚄𝚁𝙰-𝙼𝙳",
                    contextInfo: {
                        externalAdReply: {
                            title: "TikTok Downloader",
                            body: "Powered by 𝙶𝚄𝚁𝙰-𝙼𝙳",
                            thumbnailUrl: dreadedData?.tiktok?.author?.avatar || "",
                            sourceUrl: url,
                            mediaType: 2,
                            renderLargerThumbnail: true
                        }
                    }
                });
            } catch (err) {
                console.error("TikTok command error:", err);
                await bot.sendMessage(chatId, "❌ Error processing TikTok command.");
            }
        }
    },

    youtube: {
        description: "Download YouTube videos",
        usage: "youtube <video name or link>",
        aliases: ["video", "yt"],
        adminOnly: false,
        execute: async (context) => {
            const { args, chatId, sock, message } = context;
            const searchQuery = args.join(" ").trim();

            if (!searchQuery) {
                return await sock.sendMessage(chatId, { text: "🎥 What video do you want to download?" }, { quoted: message });
            }

            try {
                let videoUrl = "";
                let videoTitle = "";
                let videoThumbnail = "";

                // 🔎 Check if it's a URL or search term
                if (/^(https?:\/\/)/.test(searchQuery)) {
                    videoUrl = searchQuery;
                } else {
                    const { videos } = await yts(searchQuery);
                    if (!videos || videos.length === 0) {
                        return await sock.sendMessage(chatId, { text: "❌ No videos found!" }, { quoted: message });
                    }
                    videoUrl = videos[0].url;
                    videoTitle = videos[0].title;
                    videoThumbnail = videos[0].thumbnail;
                }

                // 📸 Send thumbnail preview
                try {
                    const ytId = (videoUrl.match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/) || [])[1];
                    const thumb = videoThumbnail || (ytId ? `https://i.ytimg.com/vi/${ytId}/sddefault.jpg` : null);
                    if (thumb) {
                        const imgRes = await axios.get(thumb, { responseType: "arraybuffer" });
                        await sock.sendMessage(chatId, {
                            image: Buffer.from(imgRes.data),
                            caption: `*${videoTitle || searchQuery}*\n⏳ Downloading...`
                        }, { quoted: message });
                    }
                } catch (e) {
                    console.error("[YOUTUBE] thumb error:", e?.message || e);
                }

                // ✅ Validate URL
                if (!videoUrl.match(/(?:youtu\.be\/|(?:www\.|m\.)?youtube\.com\/(?:watch\?v=|v\/|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/)) {
                    return await sock.sendMessage(chatId, { text: "❌ This is not a valid YouTube link!" }, { quoted: message });
                }

                // 🌐 Fetch metadata + download link
                let videoDownloadUrl = "";
                let title = "";
                try {
                    const meta = await princeVideoApi.fetchMeta(videoUrl);
                    if (meta?.success && meta?.result?.download_url) {
                        videoDownloadUrl = meta.result.download_url;
                        title = meta.result.title || "video";
                    } else {
                        return await sock.sendMessage(chatId, { text: "⚠️ Failed to fetch video from the API." }, { quoted: message });
                    }
                } catch (e) {
                    console.error("[YOUTUBE] prince API error:", e?.message || e);
                    return await sock.sendMessage(chatId, { text: "⚠️ Failed to fetch video from the API." }, { quoted: message });
                }

                const filename = `${title}.mp4`;

                // 🎥 Try sending directly via URL
                try {
                    await sock.sendMessage(chatId, {
                        video: { url: videoDownloadUrl },
                        mimetype: "video/mp4",
                        fileName: filename,
                        caption: `*${title}*\n> *𝙶𝚄𝚁𝙰-𝙼𝙳 ✨*`
                    }, { quoted: message });
                    return;
                } catch (err) {
                    console.warn("[YOUTUBE] Direct send failed, falling back to buffer...", err?.message || err);
                }

                // 📥 Fallback: download as buffer
                let buffer;
                try {
                    const videoRes = await axios.get(videoDownloadUrl, {
                        headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://youtube.com/" },
                        responseType: "arraybuffer",
                    });
                    buffer = Buffer.from(videoRes.data);
                } catch (err) {
                    return await sock.sendMessage(chatId, { text: "⚠️ Failed to download the video file." }, { quoted: message });
                }

                if (!buffer || buffer.length < 1024) {
                    return await sock.sendMessage(chatId, { text: "⚠️ Downloaded file is empty or too small." }, { quoted: message });
                }

                // 📤 Send buffer
                await sock.sendMessage(chatId, {
                    video: buffer,
                    mimetype: "video/mp4",
                    fileName: filename,
                    caption: `*${title}*`
                }, { quoted: message });

            } catch (error) {
                console.error("[YOUTUBE] Command error:", error?.message || error);
                await sock.sendMessage(chatId, { text: "❌ Download failed: " + (error?.message || "Unknown error") }, { quoted: message });
            }
        }
    },

    spotify: {
        description: "Download Spotify tracks",
        usage: "spotify <track link>",
        aliases: ["spot"],
        adminOnly: false,
        execute: async (context) => {
            const { args, chatId, bot } = context;
            const url = args[0];

            if (!url) {
                return await bot.sendMessage(
                    chatId,
                    "🎵 Please provide a Spotify track link!\nExample: `spotify https://open.spotify.com/track/2DGa7iaidT5s0qnINlwMjJ`"
                );
            }

            try {
                const res = await fetch(`https://api.giftedtech.web.id/api/download/spotifydl?apikey=gifted&url=${encodeURIComponent(url)}`);
                const data = await res.json();

                if (!data.success || !data.result?.download_url) {
                    throw new Error("Spotify API failed.");
                }

                const { title, duration, thumbnail, download_url } = data.result;

                // Send track info first
                await bot.sendImage(
                    chatId,
                    await (await fetch(thumbnail)).arrayBuffer(),
                    `🎶 *Spotify Downloader* 🎶\n\n🎵 *Title:* ${title}\n⏱️ *Duration:* ${duration}\n🔗 [Download Link](${download_url})`
                );

                // Then send the audio file
                await bot.sendAudio(
                    chatId,
                    { url: download_url, mimetype: "audio/mpeg", fileName: `${title}.mp3` }
                );

            } catch (err) {
                console.error("Spotify command error:", err.message);
                await bot.sendMessage(chatId, "❌ Could not fetch Spotify track. Please try again later.");
            }
        }
    },

    image: {
        description: "Search Google Images and send a random result",
        usage: "img <search query>",
        aliases: ["img", "picture", "pic"],
        adminOnly: false,
        execute: async (context) => {
            const { args, chatId, bot } = context;
            const query = args.join(" ");

            if (!query) {
                return await bot.sendMessage(
                    chatId,
                    "❌ Please provide a search query.\nExample: `img brown dog`"
                );
            }

            try {
                const { data } = await axios.get("https://api.giftedtech.web.id/api/search/googleimage", {
                    params: { apikey: "gifted", query: query },
                    headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" }
                });

                if (!data?.success || !data?.results || data.results.length === 0) {
                    return await bot.sendMessage(chatId, "⚠️ No images found.");
                }

                // Pick a random image
                const randomImage = data.results[Math.floor(Math.random() * data.results.length)];

                // Send image
                await bot.sendImage(
                    chatId,
                    await (await axios.get(randomImage, { responseType: "arraybuffer" })).data,
                    `🔍 Google Image Result for: *${query}*\n> *𝙶𝚄𝚁𝙰-𝙼𝙳*`
                );

            } catch (err) {
                console.error("Google Image command error:", err?.response?.data || err.message);
                await bot.sendMessage(chatId, "❌ Error fetching image search result.");
            }
        }
    },

    waifu: {
        description: 'Get a random waifu picture',
        usage: 'waifu',
        aliases: ["wife"],
        adminOnly: false,
        execute: async (context) => {
            const { chatId, bot } = context;

            try {
                // Try waifu.pics API first
                const response = await axios.get("https://api.waifu.pics/sfw/waifu");

                if (response.data && response.data.url) {
                    await bot.sendImage(chatId, await (await axios.get(response.data.url, { responseType: "arraybuffer" })).data, "> 𝙶𝚄𝚁𝙰-𝙼𝙳 \n> _waifu.pics_");
                    return;
                }

                // If waifu.pics failed, use giftedtech API as fallback
                throw new Error("Primary API failed");
            } catch (error) {
                console.warn("Waifu API failed, trying fallback...", error.message);

                try {
                    const fallback = await axios.get("https://api.giftedtech.web.id/api/anime/waifu?apikey=gifted");

                    if (fallback.data && fallback.data.result) {
                        await bot.sendImage(chatId, await (await axios.get(fallback.data.result, { responseType: "arraybuffer" })).data, "> 𝙶𝚄𝚁𝙰-𝙼𝙳");
                    } else {
                        await bot.sendMessage(chatId, "❌ Couldn't fetch waifu picture, try again later!");
                    }
                } catch (fallbackError) {
                    console.error("Fallback waifu API failed:", fallbackError.message);
                    await bot.sendMessage(chatId, "⚠️ Both waifu sources are down, please try again later.");
                }
            }
        }
    },

};

module.exports = downloaderCommands;
