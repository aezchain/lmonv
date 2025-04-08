require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const mongoose = require('mongoose');
const commandHandler = require('./utils/commandHandler');
const setupWelcomeMessage = require('./utils/setupWelcomeMessage');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

// Connect to MongoDB (optional - bot will still work without it for testing)
try {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
      console.log('Connected to MongoDB');
    })
    .catch(err => {
      console.error('MongoDB connection error:', err);
      console.log('Bot will continue without database functionality');
    });
} catch (error) {
  console.error('Error setting up MongoDB:', error);
  console.log('Bot will continue without database functionality');
}

// Set up commands
commandHandler(client);

// When the client is ready, run this code
client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);
  
  // Set up the welcome message
  try {
    await setupWelcomeMessage(client);
  } catch (error) {
    console.error('Error setting up welcome message:', error);
  }
});

// Auto-check verification status every 20 seconds
const { checkVerification } = require('./utils/verificationManager');
const linkWalletCommand = require('./commands/linkWallet');
const { EmbedBuilder } = require('discord.js');

// Start an interval to check pending verifications
setInterval(async () => {
  // Make sure activeVerifications exists and is a Map
  if (!linkWalletCommand || !linkWalletCommand.activeVerifications || 
      typeof linkWalletCommand.activeVerifications.entries !== 'function') {
    // Don't log every time to avoid spamming console
    return;
  }
  
  const activeVerifications = linkWalletCommand.activeVerifications;
  
  // Only log if there are active verifications
  if (activeVerifications.size > 0) {
    console.log(`Checking ${activeVerifications.size} active verifications...`);
  }
  
  for (const [key, verification] of activeVerifications.entries()) {
    try {
      console.log(`Checking verification for user ${verification.userId}, wallet index ${verification.walletIndex}`);
      console.log(`Looking for transaction of ${verification.amount} MON to address ${verification.address}`);
      
      // Store previous status if exists
      const previousStatus = verification.lastStatus || 'pending';
      
      const verificationStatus = await checkVerification(
        verification.userId,
        verification.walletIndex
      );
      
      console.log(`Verification status: ${verificationStatus.status}`);
      
      // Update the last status in our tracking
      verification.lastStatus = verificationStatus.status;
      
      // If verification status changed from pending to verified, send a DM
      if (previousStatus === 'pending' && verificationStatus.status === 'verified') {
        try {
          // Send wallet linked confirmation DM
          const user = await client.users.fetch(verification.userId);
          
          const linkedEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Wallet Linked Successfully!')
            .setDescription(`Your wallet has been successfully linked to your Discord account.`)
            .addFields(
              { name: 'Wallet Address', value: verification.address }
            );
          
          await user.send({ embeds: [linkedEmbed] });
          
          // After wallet is linked, send a separate message about NFT status
          const nftEmbed = new EmbedBuilder()
            .setColor(verificationStatus.hasNFT ? 0x00FF00 : 0xFF0000)
            .setTitle(verificationStatus.hasNFT ? 'NFT Detected!' : 'No NFT Found')
            .setDescription(
              verificationStatus.hasNFT 
                ? `We found a Lil Monalien NFT in your wallet. You have been assigned the special role!` 
                : `We couldn't find a Lil Monalien NFT in your wallet. If you purchase one later, use the /refresh-nft command.`
            );
          
          await user.send({ embeds: [nftEmbed] });
          
          console.log(`Sent verification and NFT status DM to user ${verification.userId}`);
        } catch (dmError) {
          console.error('Error sending verification DM:', dmError);
        }
      }
      
      // If verification is no longer pending, clean up
      if (verificationStatus.status !== 'pending') {
        // If it's verified and has an NFT, assign the role
        if (verificationStatus.status === 'verified' && verificationStatus.hasNFT) {
          try {
            const guild = client.guilds.cache.get(process.env.GUILD_ID);
            if (guild) {
              const member = await guild.members.fetch(verification.userId);
              const roleId = process.env.LIL_MONALIEN_ROLE_ID;
              
              if (member && roleId) {
                await member.roles.add(roleId);
                console.log(`Assigned role to ${member.user.tag}`);
              }
            }
          } catch (roleError) {
            console.error('Error assigning role:', roleError);
          }
        }
        
        // Clear this verification from active checks
        activeVerifications.delete(key);
        console.log(`Removed verification ${key} from active checks`);
      }
    } catch (error) {
      console.error(`Error checking verification ${key}:`, error);
    }
  }
}, 20000); // Check every 20 seconds

// Login to Discord with your client's token
client.login(process.env.DISCORD_TOKEN); 