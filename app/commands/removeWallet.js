const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserWallets } = require('../utils/verificationManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove-wallet')
    .setDescription('Remove a linked Monad wallet'),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const wallets = await getUserWallets(interaction.user.id);
      
      if (wallets.length === 0) {
        return interaction.editReply('You have no linked wallets. Use /link-wallet to link a wallet first.');
      }
      
      // Create an informational embed
      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Remove Wallet')
        .setDescription('To remove a wallet, please use the "My Wallets" button in the verification channel or the `/my-wallets` command, which will show you all your linked wallets with remove buttons.');
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await interaction.editReply(`Error: ${error.message}`);
    }
  }
}; 