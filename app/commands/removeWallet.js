const { SlashCommandBuilder, EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const { getUserWallets, removeWallet } = require('../utils/verificationManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove-wallet')
    .setDescription('Remove a linked wallet'),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const wallets = await getUserWallets(interaction.user.id);
      
      if (wallets.length === 0) {
        return interaction.editReply('You have no linked wallets to remove.');
      }
      
      // Create a select menu for users to choose which wallet to remove
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('remove_wallet_select')
        .setPlaceholder('Select a wallet to remove')
        .addOptions(wallets.map((wallet, index) => ({
          label: `Wallet ${index + 1}: ${wallet.address.substring(0, 6)}...${wallet.address.substring(38)}`,
          description: wallet.hasNFT ? 'Has Lil Monalien NFT' : 'No Lil Monalien NFT',
          value: wallet.address
        })));
      
      const row = new ActionRowBuilder().addComponents(selectMenu);
      
      const response = await interaction.editReply({
        content: 'Please select a wallet to remove:',
        components: [row]
      });
      
      // Wait for the user to select a wallet
      try {
        const selection = await response.awaitMessageComponent({
          filter: i => i.user.id === interaction.user.id && i.customId === 'remove_wallet_select',
          time: 60000 // 1 minute to select
        });
        
        await selection.deferUpdate();
        
        // Get the selected wallet address
        const selectedAddress = selection.values[0];
        
        // Remove the wallet
        await removeWallet(interaction.user.id, selectedAddress);
        
        // Confirm removal
        const embed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('Wallet Removed')
          .setDescription(`Wallet ${selectedAddress} has been unlinked from your Discord account.`);
        
        await selection.editReply({
          content: null,
          embeds: [embed],
          components: []
        });
      } catch (error) {
        if (error.code === 'InteractionCollectorError') {
          await interaction.editReply({
            content: 'Wallet removal timed out. Please try again.',
            components: []
          });
        } else {
          await interaction.editReply({
            content: `Error: ${error.message}`,
            components: []
          });
        }
      }
    } catch (error) {
      await interaction.editReply(`Error: ${error.message}`);
    }
  }
}; 