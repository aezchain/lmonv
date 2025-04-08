const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { startVerification, checkVerification } = require('../utils/verificationManager');

// Store active verification sessions
const activeVerifications = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('link-wallet')
    .setDescription('Link a Monad wallet to your Discord account'),
  
  async execute(interaction) {
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
    
    // Wait for the modal submission
    try {
      const modalSubmit = await interaction.awaitModalSubmit({
        time: 60000, // 1 minute to submit
        filter: i => i.customId === 'wallet_modal'
      });
      
      // Get the wallet address from the modal
      const walletAddress = modalSubmit.fields.getTextInputValue('wallet_address');
      
      // Defer the reply to allow for processing time
      await modalSubmit.deferReply({ ephemeral: true });
      
      try {
        // Start verification process
        const verification = await startVerification(interaction.user.id, walletAddress);
        
        // Create an embed with instructions
        const embed = new EmbedBuilder()
          .setColor(0x0099FF)
          .setTitle('Wallet Verification')
          .setDescription(`To verify ownership of your wallet, please send **exactly ${verification.verificationAmount} $MON** from your wallet to the same wallet address (self-transfer).`)
          .addFields(
            { name: 'Wallet Address', value: verification.address },
            { name: 'Amount to Send', value: `${verification.verificationAmount} $MON` },
            { name: 'Time Limit', value: '10 minutes' },
            { name: 'Note', value: 'After sending the transaction, click the "Check Status" button below to verify your wallet.' }
          )
          .setFooter({ text: 'Lil Monaliens Verification Bot' });
        
        // Create check status button
        const checkButton = new ButtonBuilder()
          .setCustomId(`check_verification_${verification.walletIndex}`)
          .setLabel('Check Status')
          .setStyle(ButtonStyle.Primary);
        
        const row = new ActionRowBuilder().addComponents(checkButton);
        
        // Send the response
        const reply = await modalSubmit.editReply({
          embeds: [embed],
          components: [row]
        });
        
        // Store the verification session with additional details
        activeVerifications.set(`${interaction.user.id}_${verification.walletIndex}`, {
          userId: interaction.user.id,
          walletIndex: verification.walletIndex,
          address: verification.address,
          amount: verification.verificationAmount,
          startTime: Date.now(),
          intervalId: null,
          channelId: modalSubmit.channelId,
          interactionId: modalSubmit.id,
          messageId: reply.id // Store the message ID for later reference
        });
      } catch (error) {
        await modalSubmit.editReply(`Error: ${error.message}`);
      }
    } catch (error) {
      // Modal timed out or errored
      if (error.code === 'InteractionCollectorError') {
        console.log('Modal timed out');
      } else {
        console.error('Error with modal submission:', error);
      }
    }
  },
  
  // Button handler for checking verification status
  async buttonHandler(interaction) {
    if (!interaction.customId.startsWith('check_verification_')) {
      return false;
    }
    
    await interaction.deferReply({ ephemeral: true });
    
    const walletIndex = parseInt(interaction.customId.split('_')[2]);
    
    try {
      // Check the verification status directly from the database
      const verificationStatus = await checkVerification(interaction.user.id, walletIndex);
      
      // If there was a database error, handle it with a custom message
      if (verificationStatus.error) {
        const errorEmbed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('Database Connection Error')
          .setDescription('We are having trouble connecting to our database at the moment. Please try again in a few minutes.')
          .addFields(
            { name: 'What to do', value: 'If this error persists, please contact an administrator.' }
          );
          
        await interaction.editReply({
          embeds: [errorEmbed],
          components: []
        });
        
        return true;
      }
      
      // Also check if we already detected verification in the background
      const verificationKey = `${interaction.user.id}_${walletIndex}`;
      const verification = activeVerifications.get(verificationKey);
      const verificationAlreadyComplete = verification && verification.verificationComplete;
      
      let embed;
      let components = [];
      
      if (verificationStatus.status === 'pending' && !verificationAlreadyComplete) {
        // Still pending
        embed = new EmbedBuilder()
          .setColor(0xFFA500)
          .setTitle('Verification Pending')
          .setDescription(`We're still waiting for your transaction of the specific MON amount.`)
          .addFields(
            { name: 'Time Remaining', value: `${Math.round(10 - ((Date.now() - verification?.startTime || 0) / 1000 / 60))} minutes` },
            { name: 'Wallet Address', value: verificationStatus.address }
          );
        
        // Add check button
        const checkButton = new ButtonBuilder()
          .setCustomId(`check_verification_${walletIndex}`)
          .setLabel('Check Again')
          .setStyle(ButtonStyle.Primary);
        
        components.push(new ActionRowBuilder().addComponents(checkButton));
      } else if (verificationStatus.status === 'verified' || verificationAlreadyComplete) {
        // Verification successful
        embed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('Wallet Verified!')
          .setDescription(`Your wallet has been successfully verified.`)
          .addFields(
            { name: 'Wallet Address', value: verificationStatus.address },
            { name: 'NFT Status', value: verificationStatus.hasNFT ? 'Lil Monalien NFT detected! Role assigned.' : 'No Lil Monalien NFT found. You can use /refresh-nft later.' }
          );
        
        // Clear any active verification interval
        if (activeVerifications.has(verificationKey)) {
          if (verification && verification.intervalId) {
            clearInterval(verification.intervalId);
          }
          
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
          
          activeVerifications.delete(verificationKey);
        }
      } else if (verificationStatus.status === 'expired') {
        // Verification expired
        embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('Verification Expired')
          .setDescription(`The verification time limit has been reached. Please try again with /link-wallet.`);
        
        // Clear any active verification interval
        if (activeVerifications.has(verificationKey)) {
          if (verification && verification.intervalId) {
            clearInterval(verification.intervalId);
          }
          
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
          
          activeVerifications.delete(verificationKey);
        }
      }
      
      await interaction.editReply({
        embeds: [embed],
        components: components
      });
    } catch (error) {
      await interaction.editReply(`Error: ${error.message}`);
    }
    
    return true;
  },
  
  // Export the activeVerifications Map
  activeVerifications
}; 