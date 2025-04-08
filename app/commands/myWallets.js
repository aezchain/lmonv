const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getUserWallets, removeWallet } = require('../utils/verificationManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('my-wallets')
    .setDescription('Show your linked Monad wallets'),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
      // Get wallets from database
      const wallets = await getUserWallets(interaction.user.id);
      
      if (wallets.length === 0) {
        return interaction.editReply('You have no linked wallets. Use /link-wallet to link a wallet.');
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
      await interaction.editReply(`Error: ${error.message}`);
    }
  },
  
  // Button handler for removing wallets
  async buttonHandler(interaction) {
    if (!interaction.customId.startsWith('remove_wallet_')) {
      return false;
    }
    
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const address = interaction.customId.substring('remove_wallet_'.length);
      
      // Remove the wallet from database
      await removeWallet(interaction.user.id, address);
      
      // Get updated wallet list from database
      const updatedWallets = await getUserWallets(interaction.user.id);
      
      if (updatedWallets.length === 0) {
        return interaction.editReply('Wallet removed successfully. You have no linked wallets remaining.');
      }
      
      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('Wallet Removed Successfully')
        .setDescription(`Wallet ${address} has been removed.`)
        .addFields(
          { name: 'Remaining Wallets', value: `You have ${updatedWallets.length} wallet(s) still linked.` }
        );
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await interaction.editReply(`Error: ${error.message}`);
    }
    
    return true;
  }
}; 