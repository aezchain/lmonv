const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('db-status')
    .setDescription('Admin command: Check database status and statistics')
    .addStringOption(option =>
      option
        .setName('admin_key')
        .setDescription('Admin key for verification')
        .setRequired(true)
    ),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    // Check admin key from .env
    const adminKey = interaction.options.getString('admin_key');
    if (adminKey !== process.env.ADMIN_KEY) {
      return interaction.editReply('Invalid admin key.');
    }
    
    try {
      // Get database stats
      const totalUsers = await User.countDocuments();
      const totalWallets = await User.aggregate([
        {
          $project: {
            walletCount: { $size: '$wallets' }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$walletCount' }
          }
        }
      ]);
      
      const verifiedWallets = await User.aggregate([
        { $unwind: '$wallets' },
        { $match: { 'wallets.verified': true } },
        { $count: 'count' }
      ]);
      
      const pendingWallets = await User.aggregate([
        { $unwind: '$wallets' },
        { $match: { 'wallets.verificationStatus': 'pending' } },
        { $count: 'count' }
      ]);
      
      const nftHolders = await User.aggregate([
        { $unwind: '$wallets' },
        { $match: { 'wallets.hasNFT': true } },
        { $group: { _id: '$discordId' } },
        { $count: 'count' }
      ]);
      
      // Create embed
      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Database Status')
        .setDescription('Current status of the verification database')
        .addFields(
          { name: 'Total Users', value: totalUsers.toString() },
          { name: 'Total Wallets', value: (totalWallets[0]?.total || 0).toString() },
          { name: 'Verified Wallets', value: (verifiedWallets[0]?.count || 0).toString() },
          { name: 'Pending Verifications', value: (pendingWallets[0]?.count || 0).toString() },
          { name: 'NFT Holders (Unique Users)', value: (nftHolders[0]?.count || 0).toString() }
        );
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Database status error:', error);
      await interaction.editReply(`Error retrieving database status: ${error.message}`);
    }
  }
}; 