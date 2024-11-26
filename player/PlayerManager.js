
const { DisTube } = require('distube');
const PlayerQueue = require('./PlayerQueue');
const PlayerErrorHandler = require('./PlayerErrorHandler');
const PlayerEvents = require('./PlayerEvents');
const { SpotifyPlugin } = require('@distube/spotify');
const { YtDlpPlugin } = require('@distube/yt-dlp');
const { YouTubePlugin } = require('@distube/youtube');
const fs = require("fs");
const { EmbedBuilder } = require('discord.js');
require('dotenv').config();
class PlayerManager {
    constructor(client, distubeOptions) {
        this.client = client;
        this.distube = new DisTube(client, {
          ...distubeOptions,
          plugins: [
            
            new SpotifyPlugin({
              api: {
                clientId: process.env.SPOTIFY_CLIENT_ID,
                clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
                topTracksCountry: "US",
              },
            }),
            new YtDlpPlugin(),
          ]
        });
        this.queue = new PlayerQueue();
        this.errorHandler = new PlayerErrorHandler();
        this.events = new PlayerEvents(this.distube);
    
        this.initialize();
      }

  initialize() {
    this.distube.on('playSong', (queue, song) => this.handlePlaySong(queue, song));
    this.distube.on('addSong', (queue, song) => this.handleAddSong(queue, song));
    this.distube.on('addList', (queue, playlist) => this.handleAddList(queue, playlist));
    this.distube.on('finish', (queue) => this.handleFinish(queue));
    this.distube.on('error', (error) => this.errorHandler.handleError(error));
    this.distube.on('disconnect', (queue) => this.handleDisconnect(queue));
    this.distube.on('empty', (queue) => this.handleEmpty(queue));
    //this.distube.on('debug', (message) => console.debug(`DisTube Debug: ${message}`));
  }

  handlePlaySong(queue, song) {
    if (!queue || !queue.voiceChannel) {
      console.error('Queue or VoiceChannel is undefined');
      return;
    }

    if (queue.textChannel) {
      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Now Playing')
        .setDescription(`🎶 **[${song.name}](${song.url})**`)
        .addFields(
          { name: 'In Channel', value: `**${queue.voiceChannel}**`, inline: true },
          { name: 'Requested by', value: `**${song.user}**`, inline: true }
        )
        .setTimestamp();

      if (song.duration) {
          embed.addFields({ name: 'Duration', value: `**${song.formattedDuration}**`, inline: true });
      }

      if (song.views) {
          embed.addFields({ name: 'Views', value: `**${song.views.toLocaleString()}**`, inline: true });
      }

      if (song.likes) {
          embed.addFields({ name: 'Likes', value: `👍 **${song.likes.toLocaleString()}**`, inline: true });
      }

      if (song.dislikes) {
          embed.addFields({ name: 'Dislikes', value: `👎 **${song.dislikes.toLocaleString()}**`, inline: true });
      }

      if (song.uploader) {
          embed.addFields({
              name: 'Uploader',
              value: `**[${song.uploader.name}]**`,
              inline: true
          });
      }

      if (song.isLive) {
          embed.addFields({ name: 'Live', value: `🔴 **This is a live stream**`, inline: true });
      }

      if (song.thumbnail) {
        embed.setThumbnail(song.thumbnail);
      }

   
      queue.textChannel.send({ embeds: [embed] }).then((message) => {
        let lastProgress = -1; 

        const updateProgress = () => {
          const elapsed = queue.currentTime;
          const total = song.duration;
          const progress = Math.floor((elapsed / total) * 10); 

          if (progress !== lastProgress) {
            const progressBar = '▬'.repeat(progress) + '🔘' + '▬'.repeat(10 - progress);
            const formattedElapsed = new Date(elapsed * 1000).toISOString().substr(11, 8);
            const formattedTotal = song.formattedDuration;

            embed.setDescription(`🎶 **[${song.name}](${song.url})**\n\`${formattedElapsed}\` ${progressBar} \`${formattedTotal}\``);
            message.edit({ embeds: [embed] });

            lastProgress = progress; 
          }

          if (elapsed >= total || !queue.songs[0]) {
            clearInterval(interval); 
          }
        };

        const interval = setInterval(updateProgress, 7000); 

        this.distube.on('finish', () => clearInterval(interval)); 
      });
    }
}

  


handleAddSong(queue, song) {
  if (!queue || !queue.voiceChannel) {
    console.error('Queue or VoiceChannel is undefined');
    return;
  }
  const embed = new EmbedBuilder()
    .setColor('#00ff00')
    .setTitle('Song Added to Queue')
    .setDescription(`- Song Name :  **${song.name}**\n- Channel : **${queue.voiceChannel}**`)
    .setTimestamp();

  queue.textChannel.send({ embeds: [embed] });
}


  handleAddList(queue, playlist) {
    if (!queue || !queue.voiceChannel) {
      console.error('Queue or VoiceChannel is undefined');
      return;
    }
    //console.log(`Added ${playlist.name} to the queue in ${queue.voiceChannel.name}`);
  }

  handleFinish(queue) {
    if (!queue || !queue.voiceChannel) {
      console.error('Queue or VoiceChannel is undefined');
      return;
    }
    //console.log(`Finished playing in ${queue.voiceChannel.name}`);
    this.queue.clear(queue.voiceChannel.id);
  }

  handleDisconnect(queue) {
    if (!queue || !queue.voiceChannel) {
      console.error('Queue or VoiceChannel is undefined');
      return;
    }
    //console.log(`Disconnected from ${queue.voiceChannel.name}`);
    this.queue.clear(queue.voiceChannel.id);
  }

  handleEmpty(queue) {
    if (!queue || !queue.voiceChannel) {
      console.error('Queue or VoiceChannel is undefined');
      return;
    }
    //console.log(`Voice channel ${queue.voiceChannel.name} is empty`);
    this.queue.clear(queue.voiceChannel.id);
  }

  async playSong(channel, song, options) {
    try {
      const queue = await this.distube.play(channel, song, options);
      this.queue.add(queue);
    } catch (error) {
      this.errorHandler.handleError(error);
    }
  }

  async stop(channel) {
    try {
      const queue = this.queue.get(channel.id);
      if (queue) {
        await this.distube.stop(queue.voiceChannel);
        this.queue.clear(channel.id);
      }
    } catch (error) {
      this.errorHandler.handleError(error);
    }
  }

  async skip(channel) {
    try {
      const queue = this.queue.get(channel.id);
      if (queue) {
        await this.distube.skip(queue.voiceChannel);
      }
    } catch (error) {
      this.errorHandler.handleError(error);
    }
  }

  async leave(channel) {
    try {
      const queue = this.queue.get(channel.id);
      if (queue) {
        await this.distube.voices.get(queue.voiceChannel.id)?.leave();
        this.queue.clear(channel.id);
      }
    } catch (error) {
      this.errorHandler.handleError(error);
    }
  }
}

module.exports = PlayerManager;
