const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { refreshNFTStatus } = require('../utils/verificationManager');
require('dotenv').config();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('refresh-nft')
    .setDescription('Check your wallet(s) for NFT holdings again'),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
      // Refresh NFT status in the database
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
      
      // If any NFTs were sold, add that information to the embed
      if (refreshResult.soldNFTs && refreshResult.soldNFTs.length > 0) {
        const soldAddresses = refreshResult.soldNFTs.map(nft => nft.address).join('\n');
        embed.addFields({
          name: '🚨 NFT Ownership Change Detected',
          value: `The following wallet(s) previously had NFTs that are no longer detected:\n${soldAddresses}`
        });
      }
      
      const member = interaction.guild.members.cache.get(interaction.user.id);
      const roleId = process.env.LIL_MONALIEN_ROLE_ID;
      
      // Handle role management based on NFT status
      if (refreshResult.hasAnyNFT) {
        // If NFT found, assign the role
        try {
          if (member && roleId && !member.roles.cache.has(roleId)) {
            await member.roles.add(roleId);
            embed.addFields({
              name: 'Role Assigned',
              value: 'You have been given the Lil Monalien role!'
            });
          } else if (member && roleId && member.roles.cache.has(roleId)) {
            embed.addFields({
              name: 'Role Status',
              value: 'You already have the Lil Monalien role.'
            });
          }
        } catch (roleError) {
          console.error('Error assigning role:', roleError);
          embed.addFields({
            name: 'Role Assignment Failed',
            value: 'There was an error assigning the role. Please contact an admin.'
          });
        }
      } else {
        // If no NFTs found, remove the role
        try {
          if (member && roleId && member.roles.cache.has(roleId)) {
            await member.roles.remove(roleId);
            embed.addFields({
              name: 'Role Removed',
              value: 'The Lil Monalien role has been removed as you no longer have the NFT.'
            });
          }
        } catch (roleError) {
          console.error('Error removing role:', roleError);
          embed.addFields({
            name: 'Role Removal Failed',
            value: 'There was an error removing the role. Please contact an admin.'
          });
        }
      }
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await interaction.editReply(`Error: ${error.message}`);
    }
  }
}; 