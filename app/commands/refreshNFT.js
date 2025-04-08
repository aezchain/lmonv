const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { refreshNFTStatus } = require('../utils/verificationManager');
require('dotenv').config();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('refresh-nft')
    .setDescription('Update your NFT holdings and role status'),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const refreshResult = await refreshNFTStatus(interaction.user.id);
      
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
          const guild = interaction.guild;
          const member = guild.members.cache.get(interaction.user.id);
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
      await interaction.editReply(`Error: ${error.message}`);
    }
  }
}; 