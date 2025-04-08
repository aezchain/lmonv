const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');

module.exports = (client) => {
  client.commands = new Collection();
  client.buttonHandlers = [];
  
  const commandsPath = path.join(__dirname, '..', 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    // Set each command in the collection
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      console.log(`Registered command: ${command.data.name}`);
      
      // If the command has a button handler, add it to the list
      if ('buttonHandler' in command) {
        client.buttonHandlers.push(command.buttonHandler);
        console.log(`Registered button handler for command: ${command.data.name}`);
      }
    } else {
      console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
  }
  
  // Handle slash commands
  client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    
    const command = client.commands.get(interaction.commandName);
    
    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }
    
    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      
      const reply = {
        content: 'There was an error while executing this command!',
        ephemeral: true
      };
      
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply(reply);
      } else {
        await interaction.reply(reply);
      }
    }
  });
  
  // Handle button interactions
  client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    
    // Handle welcome message buttons
    if (interaction.customId.startsWith('welcome_')) {
      await handleWelcomeButtons(interaction, client);
      return;
    }
    
    // Handle check verification buttons
    if (interaction.customId.startsWith('check_verification_')) {
      const linkWalletCommand = client.commands.get('link-wallet');
      if (linkWalletCommand && linkWalletCommand.buttonHandler) {
        await linkWalletCommand.buttonHandler(interaction);
      } else {
        // Fallback if buttonHandler not found
        const walletIndex = parseInt(interaction.customId.split('_')[2]);
        await interaction.deferReply({ ephemeral: true });
        try {
          const { checkVerification } = require('../utils/verificationManager');
          const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
          
          const verificationStatus = await checkVerification(interaction.user.id, walletIndex);
          
          let embed;
          let components = [];
          
          if (verificationStatus.status === 'pending') {
            // Still pending
            embed = new EmbedBuilder()
              .setColor(0xFFA500)
              .setTitle('Verification Pending')
              .setDescription(`We're still waiting for your transaction of the specific MON amount.`)
              .addFields(
                { name: 'Wallet Address', value: verificationStatus.address }
              );
            
            // Add check button
            const checkButton = new ButtonBuilder()
              .setCustomId(`check_verification_${walletIndex}`)
              .setLabel('Check Again')
              .setStyle(ButtonStyle.Primary);
            
            components.push(new ActionRowBuilder().addComponents(checkButton));
          } else if (verificationStatus.status === 'verified') {
            // Verification successful
            embed = new EmbedBuilder()
              .setColor(0x00FF00)
              .setTitle('Wallet Verified!')
              .setDescription(`Your wallet has been successfully verified.`)
              .addFields(
                { name: 'Wallet Address', value: verificationStatus.address },
                { name: 'NFT Status', value: verificationStatus.hasNFT ? 'Lil Monalien NFT detected! Role assigned.' : 'No Lil Monalien NFT found. You can use /refresh-nft later.' },
                { name: 'Message Expiry', value: 'This message will automatically disappear in 20 minutes.' }
              );
            
            // Schedule this message to be deleted after 20 minutes
            setTimeout(async () => {
              try {
                // Try to delete the message
                await interaction.deleteReply().catch(() => {
                  console.log(`Could not delete verification message for user ${interaction.user.id}, it may have already been deleted`);
                });
                console.log(`Auto-deleted verification success message for user ${interaction.user.id} after 20 minutes`);
              } catch (error) {
                console.error('Error auto-deleting verification message:', error);
              }
            }, 20 * 60 * 1000); // 20 minutes in milliseconds
          } else if (verificationStatus.status === 'expired') {
            // Verification expired
            embed = new EmbedBuilder()
              .setColor(0xFF0000)
              .setTitle('Verification Expired')
              .setDescription(`The verification time limit has been reached. Please try again with /link-wallet.`);
            
            // Schedule this message to be deleted after 20 minutes
            setTimeout(async () => {
              try {
                // Try to delete the message
                await interaction.deleteReply().catch(() => {
                  console.log(`Could not delete expired verification message for user ${interaction.user.id}`);
                });
                console.log(`Auto-deleted expired verification message for user ${interaction.user.id} after 20 minutes`);
              } catch (error) {
                console.error('Error auto-deleting verification message:', error);
              }
            }, 20 * 60 * 1000); // 20 minutes in milliseconds
          }
          
          await interaction.editReply({ 
            embeds: [embed],
            components: components
          });
        } catch (error) {
          console.error('Error in fallback verification handler:', error);
          await interaction.editReply(`Error: ${error.message}`);
        }
      }
      return;
    }
    
    // Handle remove wallet buttons
    if (interaction.customId.startsWith('remove_wallet_')) {
      const myWalletsCommand = client.commands.get('my-wallets');
      if (myWalletsCommand && myWalletsCommand.buttonHandler) {
        await myWalletsCommand.buttonHandler(interaction);
      }
      return;
    }
    
    // Handle other button interactions
    for (const handler of client.buttonHandlers) {
      try {
        const handled = await handler(interaction);
        if (handled) break;
      } catch (error) {
        console.error('Error handling button interaction:', error);
      }
    }
  });
  
  // Handle modal submissions
  client.on('interactionCreate', async interaction => {
    if (!interaction.isModalSubmit()) return;
    
    // Handle wallet modal from welcome message
    if (interaction.customId === 'wallet_modal') {
      await handleWalletModalSubmit(interaction, client);
      return;
    }
  });
};

// Handle welcome message button interactions
async function handleWelcomeButtons(interaction, client) {
  try {
    // Don't defer reply here - let the command handle it
    const buttonId = interaction.customId;
    
    if (buttonId === 'welcome_link_wallet') {
      // For link-wallet, create a modal interaction
      const linkWalletCommand = client.commands.get('link-wallet');
      if (linkWalletCommand) {
        // Create a modal for the user to enter their wallet address
        const modal = {
          title: 'Enter Wallet Address',
          custom_id: 'wallet_modal',
          components: [{
            type: 1,
            components: [{
              type: 4,
              custom_id: 'wallet_address',
              label: 'Your Monad Wallet Address',
              style: 1,
              min_length: 42,
              max_length: 42,
              placeholder: '0x...',
              required: true
            }]
          }]
        };
        
        await interaction.showModal(modal);
        return;
      } else {
        await interaction.reply({ content: 'Link wallet command not found.', ephemeral: true });
      }
    } else if (buttonId === 'welcome_refresh_nft') {
      // For refresh-nft, create a new interaction
      const refreshNFTCommand = client.commands.get('refresh-nft');
      if (refreshNFTCommand) {
        await interaction.deferReply({ ephemeral: true });
        try {
          // Create a separate context for the command
          const context = { 
            user: interaction.user,
            guild: interaction.guild,
            client: client,
            deferReply: async () => {}, // No-op since we already deferred
            editReply: interaction.editReply.bind(interaction),
            reply: interaction.editReply.bind(interaction)
          };
          
          // Call the refreshNFTStatus function directly
          const { refreshNFTStatus } = require('../utils/verificationManager');
          const refreshResult = await refreshNFTStatus(interaction.user.id);
          
          // Handle the refresh result similar to the command
          const { EmbedBuilder } = require('discord.js');
          const embed = new EmbedBuilder()
            .setColor(refreshResult.hasAnyNFT ? 0x00FF00 : 0x0099FF)
            .setTitle('NFT Status Updated')
            .setDescription(refreshResult.hasAnyNFT 
              ? '✅ Lil Monalien NFT found! You have been assigned the role.' 
              : 'No Lil Monalien NFT found in your wallets.');
          
          // Add wallet details
          refreshResult.wallets.forEach((wallet, index) => {
            embed.addFields({
              name: `Wallet ${index + 1}`,
              value: `Address: ${wallet.address}\nNFT Status: ${wallet.hasNFT ? '✅ Lil Monalien NFT found' : '❌ No Lil Monalien NFT'}`
            });
          });
          
          // If NFT found, assign the role
          if (refreshResult.hasAnyNFT) {
            try {
              const member = interaction.guild.members.cache.get(interaction.user.id);
              const roleId = process.env.LIL_MONALIEN_ROLE_ID;
              
              if (member && roleId) {
                await member.roles.add(roleId);
                embed.addFields({
                  name: 'Role Assigned',
                  value: 'You have been given the Lil Monalien role!'
                });
              }
            } catch (roleError) {
              console.error('Error assigning role:', roleError);
              embed.addFields({
                name: 'Role Assignment Failed',
                value: 'There was an error assigning the role. Please contact an admin.'
              });
            }
          }
          
          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          console.error('Error refreshing NFT:', error);
          await interaction.editReply(`Error: ${error.message}`);
        }
      } else {
        await interaction.reply({ content: 'Refresh NFT command not found.', ephemeral: true });
      }
    } else if (buttonId === 'welcome_my_wallets') {
      // For my-wallets, create a new interaction
      await interaction.deferReply({ ephemeral: true });
      try {
        // Call the getUserWallets function directly
        const { getUserWallets } = require('../utils/verificationManager');
        const wallets = await getUserWallets(interaction.user.id);
        
        // Create the response similar to the command
        const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
        
        if (wallets.length === 0) {
          return interaction.editReply('You have no linked wallets. Use the Link Your Wallet button to link a wallet.');
        }
        
        const embed = new EmbedBuilder()
          .setColor(0x0099FF)
          .setTitle('Your Linked Wallets')
          .setDescription('Here are all your verified wallets:');
        
        // Add each wallet as a field
        wallets.forEach((wallet, index) => {
          embed.addFields({
            name: `Wallet ${index + 1}`,
            value: `Address: ${wallet.address}\nNFT Status: ${wallet.hasNFT ? '✅ Lil Monalien NFT found' : '❌ No Lil Monalien NFT'}`
          });
        });
        
        // Create buttons for each wallet
        const rows = wallets.map((wallet, index) => {
          const removeButton = new ButtonBuilder()
            .setCustomId(`remove_wallet_${wallet.address}`)
            .setLabel(`Remove Wallet ${index + 1}`)
            .setStyle(ButtonStyle.Danger);
          
          return new ActionRowBuilder().addComponents(removeButton);
        });
        
        await interaction.editReply({ 
          embeds: [embed],
          components: rows
        });
      } catch (error) {
        console.error('Error getting wallets:', error);
        await interaction.editReply(`Error: ${error.message}`);
      }
    }
  } catch (error) {
    console.error('Error handling welcome button:', error);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply('There was an error processing your request.');
      } else {
        await interaction.reply({ content: 'There was an error processing your request.', ephemeral: true });
      }
    } catch (replyError) {
      console.error('Error replying to interaction:', replyError);
    }
  }
}

// Handle wallet modal submissions from welcome buttons
async function handleWalletModalSubmit(interaction, client) {
  try {
    // Get the wallet address from the modal
    const walletAddress = interaction.fields.getTextInputValue('wallet_address');
    
    // Defer the reply to allow for processing time
    await interaction.deferReply({ ephemeral: true });
    
    try {
      // Call the startVerification function directly
      const { startVerification } = require('../utils/verificationManager');
      const verification = await startVerification(interaction.user.id, walletAddress);
      
      // Create an embed with instructions
      const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Wallet Verification')
        .setDescription(`To verify ownership of your wallet, please send **exactly ${verification.verificationAmount} $MON** from your wallet to the same wallet address (self-transfer).`)
        .addFields(
          { name: 'Wallet Address', value: verification.address },
          { name: 'Amount to Send', value: `${verification.verificationAmount} $MON` },
          { name: 'Time Limit', value: '10 minutes' },
          { name: 'Note', value: 'Verification success or failure messages will automatically disappear after 20 minutes.' }
        )
        .setFooter({ text: 'Lil Monaliens Verification Bot' });
      
      // Create check status button
      const checkButton = new ButtonBuilder()
        .setCustomId(`check_verification_${verification.walletIndex}`)
        .setLabel('Check Status')
        .setStyle(ButtonStyle.Primary);
      
      const row = new ActionRowBuilder().addComponents(checkButton);
      
      // Send the response
      await interaction.editReply({
        embeds: [embed],
        components: [row]
      });
      
      // Store the verification session
      const linkWalletCommand = client.commands.get('link-wallet');
      if (linkWalletCommand && linkWalletCommand.activeVerifications) {
        // Create a unique key for this verification
        const verificationKey = `${interaction.user.id}_${verification.walletIndex}`;
        
        // Store all the necessary data for automatic checking
        linkWalletCommand.activeVerifications.set(verificationKey, {
          userId: interaction.user.id,
          walletIndex: verification.walletIndex,
          address: verification.address,
          amount: verification.verificationAmount,
          startTime: Date.now(),
          intervalId: null
        });
        
        console.log(`Started verification for user ${interaction.user.id}, wallet ${verification.address}`);
        console.log(`Stored verification with key ${verificationKey} for automatic checking`);
        console.log(`Current active verifications: ${linkWalletCommand.activeVerifications.size}`);
      } else {
        console.error('Could not access activeVerifications Map');
      }
    } catch (error) {
      await interaction.editReply(`Error: ${error.message}`);
    }
  } catch (error) {
    console.error('Error handling wallet modal submit:', error);
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply('There was an error processing your request.');
    } else {
      await interaction.reply({ content: 'There was an error processing your request.', ephemeral: true });
    }
  }
} 