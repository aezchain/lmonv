require('dotenv').config();
const { Client, GatewayIntentBits, Events, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const commandHandler = require('./utils/commandHandler');
const setupWelcomeMessage = require('./utils/setupWelcomeMessage');
const { setUseInMemory } = require('./utils/verificationManager');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

// Connect to MongoDB (optional - bot will still work without it for testing)
try {
  mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 30000, // Increase timeout to 30 seconds
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000,
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
    .then(() => {
      console.log('Connected to MongoDB');
    })
    .catch(err => {
      console.error('MongoDB connection error:', err);
      console.log('Bot will continue with in-memory storage');
      // Activate in-memory storage mode
      setUseInMemory(true);
    });
} catch (error) {
  console.error('Error setting up MongoDB:', error);
  console.log('Bot will continue with in-memory storage');
  // Activate in-memory storage mode
  setUseInMemory(true);
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
  
  // Load pending verifications from database into memory
  try {
    const { loadVerificationsToCache, detectMongoDBStatus } = require('./utils/verificationManager');
    const linkWalletCommand = require('./commands/linkWallet');
    
    if (linkWalletCommand && linkWalletCommand.activeVerifications) {
      const count = await loadVerificationsToCache(linkWalletCommand.activeVerifications);
      const dbStatus = detectMongoDBStatus();
      console.log(`Loaded ${count} pending verifications into memory (using ${dbStatus.usingInMemory ? 'in-memory storage' : 'MongoDB'})`);
    } else {
      console.error('Could not access activeVerifications Map');
    }
  } catch (error) {
    console.error('Error loading verifications from database:', error);
  }
});

// Auto-check verification status every 5 seconds
const { checkVerification } = require('./utils/verificationManager');
const linkWalletCommand = require('./commands/linkWallet');

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
      
      // If verification status changed from pending to verified, handle verification
      if (previousStatus === 'pending' && verificationStatus.status === 'verified') {
        try {
          // First assign the role if the user has an NFT
          if (verificationStatus.hasNFT) {
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
          
          // Set a flag to indicate verification is complete
          verification.verificationComplete = true;
          console.log(`Marked verification as complete for user ${verification.userId}`);
          
        } catch (notifyError) {
          console.error('Error handling verification:', notifyError);
        }
      }
      
      // If verification is no longer pending, clean up
      if (verificationStatus.status !== 'pending') {
        // We already handled role assignment above, so just clean up
        activeVerifications.delete(key);
        console.log(`Removed verification ${key} from active checks`);
      }
    } catch (error) {
      console.error(`Error checking verification ${key}:`, error);
    }
  }
}, 5000); // Check every 5 seconds

// Login to Discord with your client's token
client.login(process.env.DISCORD_TOKEN); 