require('dotenv').config();
const { Client, GatewayIntentBits, Events, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const commandHandler = require('./utils/commandHandler');
const setupWelcomeMessage = require('./utils/setupWelcomeMessage');
const { setUseInMemory, loadVerificationsToCache, detectMongoDBStatus } = require('./utils/verificationManager');
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

// Connect to MongoDB (optional - bot will still work without it for testing)
try {
  console.log('Connecting to MongoDB...');
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
    .catch(async err => {
      console.error('MongoDB connection error:', err);
      
      // Before activating in-memory storage, try to load existing users from database
      try {
        // Import the User model and verificationManager
        const User = require('./models/User');
        const { setUseInMemory } = require('./utils/verificationManager');
        
        // Try to load all users from the database
        console.log('Attempting to load users from database before falling back to in-memory storage...');
        const users = await User.find({});
        
        if (users && users.length > 0) {
          console.log(`Successfully loaded ${users.length} users from database`);
          
          // Now load them into in-memory storage
          const inMemoryStorage = require('./utils/verificationManager').inMemoryStorage;
          if (inMemoryStorage) {
            users.forEach(user => {
              // Convert Mongoose document to plain object
              const userObj = user.toObject();
              inMemoryStorage.users.set(userObj.discordId, userObj);
            });
            console.log(`Loaded ${inMemoryStorage.users.size} users into in-memory storage`);
          }
        } else {
          console.log('No users found in database');
        }
      } catch (loadError) {
        console.error('Error loading users from database:', loadError);
      }
      
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

  // Set up periodic NFT ownership verification (every 24 hours)
  setupPeriodicNFTCheck(client);
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

// Add this function at the end of the file
const setupPeriodicNFTCheck = (client) => {
  // Check NFT ownership every 24 hours
  const ONE_DAY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  
  async function checkAllUsersNFTOwnership() {
    try {
      console.log('Running scheduled NFT ownership verification for all users...');
      
      // Get the guild where the bot is operating
      const guild = client.guilds.cache.first();
      if (!guild) {
        console.error('Error: Guild not found for NFT ownership check');
        return;
      }
      
      // Get the role ID from environment variables
      const roleId = process.env.LIL_MONALIEN_ROLE_ID;
      if (!roleId) {
        console.error('Error: LIL_MONALIEN_ROLE_ID not set in environment variables');
        return;
      }
      
      // Get all members with the NFT role
      const role = guild.roles.cache.get(roleId);
      if (!role) {
        console.error(`Error: Role with ID ${roleId} not found`);
        return;
      }
      
      // Get members with the role
      const membersWithRole = role.members;
      console.log(`Found ${membersWithRole.size} members with the NFT role`);
      
      // Check each member's NFT status
      let roleRemovedCount = 0;
      
      for (const [memberId, member] of membersWithRole) {
        try {
          const { refreshNFTStatus } = require('./utils/verificationManager');
          const refreshResult = await refreshNFTStatus(memberId);
          
          // If the user no longer has any NFTs, remove the role
          if (!refreshResult.hasAnyNFT) {
            console.log(`User ${member.user.tag} (${memberId}) no longer has NFTs. Removing role...`);
            await member.roles.remove(roleId);
            roleRemovedCount++;
          }
        } catch (error) {
          // Skip users that don't have wallets registered, etc.
          if (error.message === 'User not found' || error.message === 'No verified wallets found') {
            console.log(`User ${member.user.tag} (${memberId}) doesn't have verified wallets. Removing role...`);
            await member.roles.remove(roleId);
            roleRemovedCount++;
          } else {
            console.error(`Error checking NFT status for user ${memberId}:`, error);
          }
        }
      }
      
      console.log(`Scheduled NFT check complete. Removed roles from ${roleRemovedCount} users.`);
    } catch (error) {
      console.error('Error in scheduled NFT ownership check:', error);
    }
  }
  
  // Run the check once at startup
  setTimeout(checkAllUsersNFTOwnership, 60000); // 1 minute after startup
  
  // Then schedule it to run every 24 hours
  setInterval(checkAllUsersNFTOwnership, ONE_DAY);
  
  console.log('Scheduled NFT ownership verification set up (will run daily)');
}; 