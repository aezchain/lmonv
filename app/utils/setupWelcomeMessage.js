const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
require('dotenv').config();

/**
 * Creates or updates a persistent welcome message in the specified channel
 * @param {Client} client - Discord.js client
 */
async function setupWelcomeMessage(client) {
  try {
    // Get the channel where the welcome message should be posted
    // If you have a specific channel ID, you can set it in the .env file as WELCOME_CHANNEL_ID
    const channelId = process.env.WELCOME_CHANNEL_ID || process.env.GUILD_ID;
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    
    if (!guild) {
      console.error('Guild not found');
      return;
    }
    
    let channel;
    
    // Try to get the channel, or create a verification channel if it doesn't exist
    if (process.env.WELCOME_CHANNEL_ID) {
      channel = guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID);
    } else {
      // Look for a channel named "wallet-verification"
      channel = guild.channels.cache.find(c => c.name === 'wallet-verification');
      
      // If the channel doesn't exist, create it
      if (!channel) {
        console.log('Creating wallet-verification channel');
        try {
          channel = await guild.channels.create({
            name: 'wallet-verification',
            topic: 'Verify your Monad wallet and check for Lil Monalien NFTs',
            permissionOverwrites: [
              {
                id: guild.roles.everyone.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                deny: [PermissionFlagsBits.SendMessages]
              },
              {
                id: client.user.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
              }
            ]
          });
          
          console.log(`Created wallet-verification channel: ${channel.id}`);
        } catch (error) {
          console.error('Error creating channel:', error);
          // Try to find any text channel we can post in
          channel = guild.channels.cache.find(
            c => c.type === 0 && c.permissionsFor(client.user).has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel])
          );
          
          if (!channel) {
            throw new Error('Could not find or create a suitable channel');
          }
        }
      }
    }
    
    if (!channel) {
      console.error('Channel not found and could not be created');
      return;
    }
    
    // Create the embed for the welcome message
    const welcomeEmbed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('Wallet Verification')
      .setDescription('Link your wallet to join the Lil Monaliens community.')
      .addFields(
        { name: 'Steps:', value: 
          '1. Click **Link Your Wallet** to register your wallet.\n' +
          '2. Complete the verification by sending the specified amount of $MON.\n' +
          '3. Use **Update Holdings** to update your roles based on NFTs.'
        }
      )
      .setFooter({ text: 'Wallet Verification System • ' + new Date().toISOString() });
    
    // Create buttons for the welcome message
    const linkButton = new ButtonBuilder()
      .setCustomId('welcome_link_wallet')
      .setLabel('Link Your Wallet')
      .setStyle(ButtonStyle.Primary);
    
    const refreshButton = new ButtonBuilder()
      .setCustomId('welcome_refresh_nft')
      .setLabel('Update Holdings')
      .setStyle(ButtonStyle.Secondary);
    
    const myWalletsButton = new ButtonBuilder()
      .setCustomId('welcome_my_wallets')
      .setLabel('Show Linked Wallets')
      .setStyle(ButtonStyle.Secondary);
    
    const row = new ActionRowBuilder().addComponents(linkButton, refreshButton, myWalletsButton);
    
    // Check if the bot has permission to manage messages (for pinning)
    const hasManageMessagesPermission = channel.permissionsFor(client.user)?.has(PermissionFlagsBits.ManageMessages);
    
    try {
      // Check if there's already a welcome message pinned in the channel
      let existingWelcomeMessage = null;
      
      if (hasManageMessagesPermission) {
        const pins = await channel.messages.fetchPinned();
        existingWelcomeMessage = pins.find(msg => 
          msg.author.id === client.user.id && 
          msg.embeds.length > 0 && 
          msg.embeds[0].title === 'Wallet Verification'
        );
      } else {
        // If we can't fetch pins, try to find the most recent welcome message
        const messages = await channel.messages.fetch({ limit: 50 });
        existingWelcomeMessage = messages.find(msg => 
          msg.author.id === client.user.id && 
          msg.embeds.length > 0 && 
          msg.embeds[0].title === 'Wallet Verification'
        );
      }
      
      if (existingWelcomeMessage) {
        // Update the existing message
        await existingWelcomeMessage.edit({ embeds: [welcomeEmbed], components: [row] });
        console.log('Updated existing welcome message');
      } else {
        // Send a new message
        const welcomeMessage = await channel.send({ embeds: [welcomeEmbed], components: [row] });
        
        // Try to pin it if we have permission
        if (hasManageMessagesPermission) {
          try {
            await welcomeMessage.pin();
            console.log('Created new welcome message and pinned it');
          } catch (pinError) {
            console.error('Error pinning welcome message:', pinError);
            console.log('Created new welcome message but could not pin it');
          }
        } else {
          console.log('Created new welcome message (no permission to pin)');
        }
      }
    } catch (error) {
      console.error('Error setting up welcome message content:', error);
      // As a last resort, just try to send a new message
      await channel.send({ embeds: [welcomeEmbed], components: [row] });
      console.log('Created fallback welcome message');
    }
  } catch (error) {
    console.error('Error in setupWelcomeMessage:', error);
    throw error;
  }
}

module.exports = setupWelcomeMessage; 