const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserWallets } = require('../utils/verificationManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('my-wallets')
    .setDescription('Show your linked Monad wallets'),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const wallets = await getUserWallets(interaction.user.id);
      
      if (wallets.length === 0) {
        return interaction.editReply('You have no linked wallets. Use /link-wallet to link a wallet.');
      }
      
      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Your Linked Wallets')
        .setDescription('Here are all your verified wallets:')
        .setFooter({ text: 'Use /remove-wallet to remove a wallet' });
      
      // Add each wallet as a field
      wallets.forEach((wallet, index) => {
        embed.addFields({
          name: `Wallet ${index + 1}`,
          value: `Address: ${wallet.address}\nNFT Status: ${wallet.hasNFT ? '✅ Lil Monalien NFT found' : '❌ No Lil Monalien NFT'}`
        });
      });
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await interaction.editReply(`Error: ${error.message}`);
    }
  }
}; 