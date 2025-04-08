const { checkTransactions, checkNFTHoldings } = require('./blockVisionApi');
const User = require('../models/User');

// In-memory fallback storage for when MongoDB isn't available
const inMemoryStorage = {
  users: new Map(),
  isActive: false
};

// Generate a random MON amount
const generateRandomAmount = () => {
  // Generate a random amount between 0.001 and 0.002 MON with only 6 decimal places
  const baseAmount = 0.001;
  const maxRandomPart = 0.001;
  
  // Generate a random number between 0-999 and divide by 1000000 to get 3 random decimal places
  const randomDigits = Math.floor(Math.random() * 1000);
  const randomPart = randomDigits / 1000000;
  
  const amount = baseAmount + randomPart;
  // Format to 6 decimal places for display
  const formattedAmount = amount.toFixed(6);
  
  // Also calculate the Wei amount (1 MON = 10^18 Wei)
  const weiAmount = BigInt(Math.floor(amount * 1000000)) * BigInt(10**12);
  
  console.log(`Generated verification amount: ${formattedAmount} MON (${weiAmount} Wei)`);
  return formattedAmount;
};

// Start the verification process for a user
const startVerification = async (discordId, address) => {
  try {
    // Check if address is valid
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      throw new Error('Invalid Monad address format');
    }
    
    address = address.toLowerCase();
    
    if (inMemoryStorage.isActive) {
      // Using in-memory storage as fallback
      let user = inMemoryStorage.users.get(discordId);
      
      // Check if this address is already verified by this user
      if (user) {
        const existingWallet = user.wallets.find(w => 
          w.address.toLowerCase() === address && w.verified
        );
        
        if (existingWallet) {
          throw new Error('This wallet is already verified');
        }
      } else {
        // Create user if not found
        user = { discordId, wallets: [] };
        inMemoryStorage.users.set(discordId, user);
      }
      
      // Check if this address is verified by another user
      for (const [userId, userData] of inMemoryStorage.users.entries()) {
        if (userId !== discordId) {
          const existingWallet = userData.wallets.find(w => 
            w.address.toLowerCase() === address && w.verified
          );
          
          if (existingWallet) {
            throw new Error('This wallet is already verified by another user');
          }
        }
      }
      
      // Generate a random verification amount
      const verificationAmount = generateRandomAmount();
      
      // Add the new wallet verification attempt
      user.wallets.push({
        address,
        verificationAmount,
        verificationStartTime: new Date(),
        verified: false,
        hasNFT: false,
        verificationStatus: 'pending'
      });
      
      return {
        address,
        verificationAmount,
        walletIndex: user.wallets.length - 1
      };
    } else {
      // Use MongoDB if available
      try {
        // Find or create the user in MongoDB
        let user = await User.findOne({ discordId });
        
        // If user exists, check if wallet is already verified
        if (user) {
          const existingWallet = user.wallets.find(w => 
            w.address.toLowerCase() === address && w.verified
          );
          
          if (existingWallet) {
            throw new Error('This wallet is already verified');
          }
        } else {
          // Create new user if not found
          user = new User({ discordId, wallets: [] });
        }
        
        // Check if this address is verified by another user
        const otherUserWithWallet = await User.findOne({
          discordId: { $ne: discordId },
          'wallets.address': address,
          'wallets.verified': true
        });
        
        if (otherUserWithWallet) {
          throw new Error('This wallet is already verified by another user');
        }
        
        // Generate a random verification amount
        const verificationAmount = generateRandomAmount();
        
        // Add the new wallet verification attempt
        user.wallets.push({
          address,
          verificationAmount,
          verificationStartTime: new Date(),
          verified: false,
          hasNFT: false,
          verificationStatus: 'pending'
        });
        
        // Save to database
        await user.save();
        
        return {
          address,
          verificationAmount,
          walletIndex: user.wallets.length - 1
        };
      } catch (dbError) {
        console.error('MongoDB error, falling back to in-memory storage:', dbError);
        // Activate in-memory storage for future requests
        inMemoryStorage.isActive = true;
        
        // Recursively call the function to use in-memory storage
        return startVerification(discordId, address);
      }
    }
  } catch (error) {
    throw error;
  }
};

// Check verification status
const checkVerification = async (discordId, walletIndex) => {
  try {
    let user, wallet;
    
    // Check if the user already exists in in-memory storage first
    const inMemoryUser = inMemoryStorage.users.get(discordId);
    
    if (inMemoryStorage.isActive || (inMemoryUser && inMemoryUser.wallets && inMemoryUser.wallets[walletIndex])) {
      // Using in-memory storage by preference or because data is already there
      user = inMemoryUser;
      
      if (!user || !user.wallets[walletIndex]) {
        throw new Error('Verification not found in memory');
      }
      
      wallet = user.wallets[walletIndex];
    } else {
      // Use MongoDB if available and data is not in memory
      try {
        // Get user from database
        user = await User.findOne({ discordId }).maxTimeMS(15000);
        
        if (!user || !user.wallets[walletIndex]) {
          // Check in-memory again before giving up, in case it was added after the initial check
          if (inMemoryStorage.users.get(discordId)?.wallets?.[walletIndex]) {
            inMemoryStorage.isActive = true;
            return checkVerification(discordId, walletIndex);
          }
          
          throw new Error('Verification not found in database');
        }
        
        wallet = user.wallets[walletIndex];
      } catch (dbError) {
        console.error('MongoDB error, falling back to in-memory storage:', dbError);
        // Activate in-memory storage for future requests
        inMemoryStorage.isActive = true;
        
        // Try to get from in-memory storage
        user = inMemoryStorage.users.get(discordId);
        
        if (!user || !user.wallets[walletIndex]) {
          return {
            status: 'pending',
            address: 'Database error - no verification found',
            timeRemaining: 10,
            error: true
          };
        }
        
        wallet = user.wallets[walletIndex];
      }
    }
    
    // Check if verification already completed or expired
    if (wallet.verificationStatus !== 'pending') {
      return {
        status: wallet.verificationStatus,
        address: wallet.address,
        hasNFT: wallet.hasNFT
      };
    }
    
    // Check if verification timed out (10 minutes)
    const verificationTime = new Date(wallet.verificationStartTime);
    const currentTime = new Date();
    const timeDiff = (currentTime - verificationTime) / 1000 / 60; // in minutes
    
    if (timeDiff > 10) {
      // Update status
      wallet.verificationStatus = 'expired';
      
      if (!inMemoryStorage.isActive) {
        try {
          await user.save();
        } catch (saveError) {
          console.error('Error saving expired status to MongoDB:', saveError);
          // Activate in-memory storage for future requests
          inMemoryStorage.isActive = true;
        }
      }
      
      return {
        status: 'expired',
        address: wallet.address
      };
    }
    
    try {
      // Check if the transaction has been made
      const transactionVerified = await checkTransactions(
        wallet.address, 
        wallet.verificationAmount
      );
      
      if (transactionVerified) {
        // Verification successful
        wallet.verified = true;
        wallet.verificationStatus = 'verified';
        
        // Immediately check for NFT status
        console.log(`Wallet verified, checking for NFT holdings: ${wallet.address}`);
        try {
          const hasNFT = await checkNFTHoldings(wallet.address);
          wallet.hasNFT = hasNFT;
          console.log(`NFT check completed for ${wallet.address}, hasNFT: ${hasNFT}`);
          
          // If NFT found, log for debugging
          if (hasNFT) {
            console.log(`✅ NFT DETECTED for wallet ${wallet.address}`);
          } else {
            console.log(`❌ NO NFT found for wallet ${wallet.address}`);
          }
        } catch (nftError) {
          console.error('Error checking NFT holdings:', nftError);
          wallet.hasNFT = false;
        }
        
        // Save the updated wallet status
        if (!inMemoryStorage.isActive) {
          try {
            await user.save();
          } catch (saveError) {
            console.error('Error saving verified status to MongoDB:', saveError);
            // Activate in-memory storage for future requests
            inMemoryStorage.isActive = true;
          }
        }
        
        return {
          status: 'verified',
          address: wallet.address,
          hasNFT: wallet.hasNFT
        };
      }
    } catch (blockchainError) {
      console.error('Error checking blockchain:', blockchainError);
      // Continue and return pending status if blockchain check fails
    }
    
    return {
      status: 'pending',
      address: wallet.address,
      timeRemaining: 10 - timeDiff
    };
  } catch (error) {
    console.error('Error in checkVerification:', error);
    // Return a fallback response if something goes wrong
    return {
      status: 'pending',
      address: 'Error - try again later',
      timeRemaining: 10,
      error: true
    };
  }
};

// Get all verified wallets for a user
const getUserWallets = async (discordId) => {
  try {
    let user;
    
    if (inMemoryStorage.isActive) {
      // Using in-memory storage as fallback
      user = inMemoryStorage.users.get(discordId);
      
      if (!user) {
        return [];
      }
      
      return user.wallets
        .filter(wallet => wallet.verified)
        .map(wallet => ({
          address: wallet.address,
          hasNFT: wallet.hasNFT
        }));
    } else {
      // Use MongoDB if available
      try {
        // Get user from database
        user = await User.findOne({ discordId });
        
        if (!user) {
          return [];
        }
        
        // Return only verified wallets
        return user.wallets
          .filter(wallet => wallet.verified)
          .map(wallet => ({
            address: wallet.address,
            hasNFT: wallet.hasNFT
          }));
      } catch (dbError) {
        console.error('MongoDB error, falling back to in-memory storage:', dbError);
        // Activate in-memory storage for future requests
        inMemoryStorage.isActive = true;
        
        // Try to get from in-memory storage
        user = inMemoryStorage.users.get(discordId);
        
        if (!user) {
          return [];
        }
        
        return user.wallets
          .filter(wallet => wallet.verified)
          .map(wallet => ({
            address: wallet.address,
            hasNFT: wallet.hasNFT
          }));
      }
    }
  } catch (error) {
    console.error('Error in getUserWallets:', error);
    return [];
  }
};

// Remove a wallet
const removeWallet = async (discordId, address) => {
  try {
    let user;
    
    if (inMemoryStorage.isActive) {
      // Using in-memory storage as fallback
      user = inMemoryStorage.users.get(discordId);
      
      if (!user) {
        throw new Error('User not found');
      }
      
      // Find wallet by address (case insensitive)
      const walletIndex = user.wallets.findIndex(w => 
        w.address.toLowerCase() === address.toLowerCase() && w.verified
      );
      
      if (walletIndex === -1) {
        throw new Error('Verified wallet not found');
      }
      
      // Remove the wallet from the array
      user.wallets.splice(walletIndex, 1);
      
      return true;
    } else {
      // Use MongoDB if available
      try {
        // Get user from database
        user = await User.findOne({ discordId });
        
        if (!user) {
          throw new Error('User not found');
        }
        
        // Find wallet by address (case insensitive)
        const walletIndex = user.wallets.findIndex(w => 
          w.address.toLowerCase() === address.toLowerCase() && w.verified
        );
        
        if (walletIndex === -1) {
          throw new Error('Verified wallet not found');
        }
        
        // Remove the wallet from the array
        user.wallets.splice(walletIndex, 1);
        
        // Save the updated user to database
        await user.save();
        
        return true;
      } catch (dbError) {
        console.error('MongoDB error, falling back to in-memory storage:', dbError);
        // Activate in-memory storage for future requests
        inMemoryStorage.isActive = true;
        
        // Try to remove from in-memory storage
        return removeWallet(discordId, address);
      }
    }
  } catch (error) {
    throw error;
  }
};

// Refresh NFT status for all wallets
const refreshNFTStatus = async (discordId) => {
  try {
    let user, verifiedWallets;
    
    if (inMemoryStorage.isActive) {
      // Using in-memory storage as fallback
      user = inMemoryStorage.users.get(discordId);
      
      if (!user) {
        throw new Error('User not found');
      }
      
      verifiedWallets = user.wallets.filter(wallet => wallet.verified);
      
      if (verifiedWallets.length === 0) {
        throw new Error('No verified wallets found');
      }
    } else {
      // Use MongoDB if available
      try {
        // Get user from database
        user = await User.findOne({ discordId });
        
        if (!user) {
          throw new Error('User not found');
        }
        
        verifiedWallets = user.wallets.filter(wallet => wallet.verified);
        
        if (verifiedWallets.length === 0) {
          throw new Error('No verified wallets found');
        }
      } catch (dbError) {
        console.error('MongoDB error, falling back to in-memory storage:', dbError);
        // Activate in-memory storage for future requests
        inMemoryStorage.isActive = true;
        
        // Try to get from in-memory storage
        return refreshNFTStatus(discordId);
      }
    }
    
    let hasAnyNFT = false;
    const soldNFTs = []; // Track wallets that previously had an NFT but now don't
    
    // Check NFT status for each wallet
    for (const wallet of verifiedWallets) {
      try {
        console.log(`Refreshing NFT status for wallet: ${wallet.address}`);
        
        // Store previous NFT state
        const previouslyHadNFT = wallet.hasNFT;
        
        // Check current NFT status
        const hasNFT = await checkNFTHoldings(wallet.address);
        wallet.hasNFT = hasNFT;
        
        // Log results for debugging
        if (hasNFT) {
          console.log(`✅ NFT DETECTED for wallet ${wallet.address}`);
          hasAnyNFT = true;
        } else {
          console.log(`❌ NO NFT found for wallet ${wallet.address}`);
          
          // If they previously had an NFT but now don't, they likely sold it
          if (previouslyHadNFT) {
            console.log(`🚨 NFT SOLD DETECTION: Wallet ${wallet.address} previously had an NFT but now doesn't`);
            soldNFTs.push({
              address: wallet.address,
              previousState: true,
              currentState: false
            });
          }
        }
      } catch (error) {
        console.error(`Error checking NFT holdings for ${wallet.address}:`, error);
      }
    }
    
    // Save updated wallet data if using MongoDB
    if (!inMemoryStorage.isActive) {
      try {
        await user.save();
      } catch (saveError) {
        console.error('Error saving NFT status to MongoDB:', saveError);
        // Activate in-memory storage for future requests
        inMemoryStorage.isActive = true;
      }
    }
    
    return {
      wallets: verifiedWallets.map(wallet => ({
        address: wallet.address,
        hasNFT: wallet.hasNFT
      })),
      hasAnyNFT,
      soldNFTs  // Include information about sold NFTs
    };
  } catch (error) {
    throw error;
  }
};

// Load all verifications into in-memory cache for auto-checking
const loadVerificationsToCache = async (activeVerifications) => {
  try {
    if (inMemoryStorage.isActive) {
      let count = 0;
      
      // Load from in-memory storage
      for (const [userId, user] of inMemoryStorage.users.entries()) {
        const pendingWallets = user.wallets.filter(w => w.verificationStatus === 'pending');
        
        for (let i = 0; i < pendingWallets.length; i++) {
          const wallet = pendingWallets[i];
          const walletIndex = user.wallets.findIndex(w => w.address === wallet.address);
          
          // Create verification key
          const verificationKey = `${userId}_${walletIndex}`;
          
          // Add to active verifications map
          activeVerifications.set(verificationKey, {
            userId: userId,
            walletIndex: walletIndex,
            address: wallet.address,
            amount: wallet.verificationAmount,
            startTime: wallet.verificationStartTime.getTime(),
            lastStatus: 'pending'
          });
          
          count++;
        }
      }
      
      console.log(`Loaded ${count} pending verifications from in-memory storage`);
      return count;
    } else {
      // Try to load from MongoDB
      try {
        // Find all users with pending verifications
        const users = await User.find({
          'wallets.verificationStatus': 'pending'
        });
        
        let count = 0;
        
        // Add each pending verification to the active cache
        for (const user of users) {
          const pendingWallets = user.wallets.filter(w => w.verificationStatus === 'pending');
          
          for (let i = 0; i < pendingWallets.length; i++) {
            const wallet = pendingWallets[i];
            const walletIndex = user.wallets.findIndex(w => w.address === wallet.address);
            
            // Create verification key
            const verificationKey = `${user.discordId}_${walletIndex}`;
            
            // Add to active verifications map
            activeVerifications.set(verificationKey, {
              userId: user.discordId,
              walletIndex: walletIndex,
              address: wallet.address,
              amount: wallet.verificationAmount,
              startTime: wallet.verificationStartTime.getTime(),
              lastStatus: 'pending'
            });
            
            count++;
          }
        }
        
        console.log(`Loaded ${count} pending verifications from database`);
        return count;
      } catch (dbError) {
        console.error('MongoDB error, falling back to in-memory storage:', dbError);
        // Activate in-memory storage for future requests
        inMemoryStorage.isActive = true;
        
        // Try to load from in-memory storage
        return loadVerificationsToCache(activeVerifications);
      }
    }
  } catch (error) {
    console.error('Error loading verifications to cache:', error);
    return 0;
  }
};

// Detect if MongoDB connection is working
const detectMongoDBStatus = () => {
  return { usingInMemory: inMemoryStorage.isActive };
};

// Manually set to use in-memory storage
const setUseInMemory = (value) => {
  inMemoryStorage.isActive = value;
  return { usingInMemory: inMemoryStorage.isActive };
};

module.exports = {
  startVerification,
  checkVerification,
  getUserWallets,
  removeWallet,
  refreshNFTStatus,
  generateRandomAmount,
  loadVerificationsToCache,
  detectMongoDBStatus,
  setUseInMemory
}; 