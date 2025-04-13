require('dotenv').config();
const { Client, GatewayIntentBits, Events, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const commandHandler = require('./utils/commandHandler');
const setupWelcomeMessage = require('./utils/setupWelcomeMessage');
const { setUseInMemory, loadVerificationsToCache, detectMongoDBStatus, syncInMemoryToMongoDB } = require('./utils/verificationManager');
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

// Connect to MongoDB with improved error handling and reconnection logic
console.log('Connecting to MongoDB...');

// Set up connection options with retry and reconnect
const mongooseOptions = {
  serverSelectionTimeoutMS: 30000, // Increase timeout to 30 seconds
  socketTimeoutMS: 45000,
  connectTimeoutMS: 30000,
  useNewUrlParser: true,
  useUnifiedTopology: true,
  // Add auto-reconnect options
  autoReconnect: true,
  reconnectTries: Number.MAX_VALUE, 
  reconnectInterval: 1000
};

// Initialize a connection
mongoose.connect(process.env.MONGODB_URI, mongooseOptions)
  .then(() => {
    console.log('Connected to MongoDB successfully');
    setUseInMemory(false); // Ensure we're using the database, not in-memory
  })
  .catch(err => {
    console.error('Initial MongoDB connection error:', err);
    console.log('Will attempt to reconnect or fall back to in-memory storage');
  });

// Handle connection events for better monitoring and reconnection
mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to MongoDB');
  setUseInMemory(false);
  // When connection is established, try to load users into memory as backup
  loadUsersIntoMemoryBackup();
  // If we were using in-memory storage, sync it back to MongoDB
  syncInMemoryToMongoDB().then(result => {
    if (result.synced > 0) {
      console.log(`Synced ${result.synced} users from in-memory storage to MongoDB after connection restored`);
    }
  }).catch(err => {
    console.error('Error syncing in-memory data to MongoDB:', err);
  });
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
  if (err.name === 'MongoNetworkError' || err.name === 'MongoTimeoutError') {
    console.log('Network error detected, will attempt to reconnect...');
    // Connection will automatically retry 
  }
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected from MongoDB');
  // Only switch to in-memory if disconnection persists
  // The auto-reconnect will try to restore the connection
});

// Function to load users from MongoDB into memory as a backup
async function loadUsersIntoMemoryBackup() {
  try {
    // Import the User model and verificationManager
    const User = require('./models/User');
    const { inMemoryStorage } = require('./utils/verificationManager');
    
    console.log('Loading all users from database into memory as backup...');
    const users = await User.find({});
    
    if (users && users.length > 0) {
      console.log(`Successfully loaded ${users.length} users from database`);
      
      // Load them into in-memory storage as backup
      users.forEach(user => {
        // Convert Mongoose document to plain object
        const userObj = user.toObject();
        inMemoryStorage.users.set(userObj.discordId, userObj);
      });
      
      console.log(`Loaded ${inMemoryStorage.users.size} users into in-memory backup storage`);
    } else {
      console.log('No users found in database to load into memory backup');
    }
  } catch (loadError) {
    console.error('Error loading users from database into memory backup:', loadError);
  }
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
  // Check NFT ownership for all users with the role every 24 hours
  const ONE_DAY = 24 * 60 * 60 * 1000;
  
  async function checkAllUsersNFTOwnership() {
    try {
      const guild = client.guilds.cache.get(process.env.GUILD_ID);
      
      if (!guild) {
        console.error('Guild not found for periodic NFT check');
        return;
      }
      
      const roleId = process.env.LIL_MONALIEN_ROLE_ID;
      if (!roleId) {
        console.error('Role ID not configured for periodic NFT check');
        return;
      }
      
      // Fetch all members with the role
      const membersWithRole = await guild.members.fetch();
      const membersWithRoleFiltered = membersWithRole.filter(member => 
        member.roles.cache.has(roleId) && !member.user.bot
      );
      
      console.log(`Checking NFT ownership for ${membersWithRoleFiltered.size} members with the role...`);
      
      // If no members have the role, nothing to do
      if (membersWithRoleFiltered.size === 0) {
        console.log('No members found with the role.');
        return;
      }
      
      let errorCount = 0;
      
      for (const [memberId, member] of membersWithRoleFiltered) {
        try {
          const { refreshNFTStatus } = require('./utils/verificationManager');
          const refreshResult = await refreshNFTStatus(memberId);
          
          // Just log the NFT status for monitoring, but never remove roles
          if (refreshResult.error) {
            errorCount++;
            console.log(`Error for ${member.user.tag}: ${refreshResult.error}. No action taken.`);
          } else if (refreshResult.hasAnyNFT) {
            console.log(`User ${member.user.tag} (${memberId}) still has NFTs. Role kept.`);
          } else if (!refreshResult.hasAnyNFT && refreshResult.wallets && refreshResult.wallets.length > 0) {
            // Just log that user no longer has NFTs, but don't remove role
            console.log(`User ${member.user.tag} (${memberId}) no longer has NFTs. No action taken.`);
          } else {
            console.log(`User ${member.user.tag} (${memberId}) status checked. No action taken.`);
          }
        } catch (error) {
          errorCount++;
          console.error(`Unexpected error checking NFT status for user ${memberId}:`, error);
          console.log(`No action taken for ${member.user.tag} due to error.`);
        }
      }
      
      console.log(`Scheduled NFT check complete. Monitoring only (no role changes). Encountered ${errorCount} errors.`);
    } catch (error) {
      console.error('Error in scheduled NFT ownership check:', error);
    }
  }
  
  // Run the check once at startup, but with a delay to ensure database is connected
  setTimeout(checkAllUsersNFTOwnership, 120000); // 2 minutes after startup
  
  // Then schedule it to run every 24 hours
  setInterval(checkAllUsersNFTOwnership, ONE_DAY);
  
  console.log('Scheduled NFT ownership verification set up (will run daily, monitoring only)');
}; 