const { checkTransactions, checkNFTHoldings } = require('./blockVisionApi');

// In-memory storage for mocking database functionality
const mockDatabase = {
  users: new Map()
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
      throw new Error('Invalid Ethereum address format');
    }
    
    address = address.toLowerCase();
    
    // Check if this address is already verified by this user
    let user = mockDatabase.users.get(discordId);
    
    if (user) {
      const existingWallet = user.wallets.find(w => 
        w.address.toLowerCase() === address && w.verified
      );
      
      if (existingWallet) {
        throw new Error('This wallet is already verified');
      }
    }
    
    // Check if this address is verified by another user
    for (const [userId, userData] of mockDatabase.users.entries()) {
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
    
    // Create or update user
    if (!user) {
      user = { discordId, wallets: [] };
      mockDatabase.users.set(discordId, user);
    }
    
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
  } catch (error) {
    throw error;
  }
};

// Check verification status
const checkVerification = async (discordId, walletIndex) => {
  try {
    const user = mockDatabase.users.get(discordId);
    
    if (!user || !user.wallets[walletIndex]) {
      throw new Error('Verification not found');
    }
    
    const wallet = user.wallets[walletIndex];
    
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
      wallet.verificationStatus = 'expired';
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
      address: wallet.address
    };
  } catch (error) {
    throw error;
  }
};

// Get all verified wallets for a user
const getUserWallets = async (discordId) => {
  try {
    const user = mockDatabase.users.get(discordId);
    
    if (!user) {
      return [];
    }
    
    return user.wallets.filter(wallet => wallet.verified).map(wallet => ({
      address: wallet.address,
      hasNFT: wallet.hasNFT
    }));
  } catch (error) {
    throw error;
  }
};

// Remove a wallet
const removeWallet = async (discordId, address) => {
  try {
    const user = mockDatabase.users.get(discordId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    const walletIndex = user.wallets.findIndex(w => 
      w.address.toLowerCase() === address.toLowerCase() && w.verified
    );
    
    if (walletIndex === -1) {
      throw new Error('Verified wallet not found');
    }
    
    user.wallets.splice(walletIndex, 1);
    
    return true;
  } catch (error) {
    throw error;
  }
};

// Refresh NFT status for all wallets
const refreshNFTStatus = async (discordId) => {
  try {
    const user = mockDatabase.users.get(discordId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    const verifiedWallets = user.wallets.filter(wallet => wallet.verified);
    
    if (verifiedWallets.length === 0) {
      throw new Error('No verified wallets found');
    }
    
    let hasAnyNFT = false;
    
    // Check NFT status for each wallet
    for (const wallet of verifiedWallets) {
      try {
        console.log(`Refreshing NFT status for wallet: ${wallet.address}`);
        const hasNFT = await checkNFTHoldings(wallet.address);
        wallet.hasNFT = hasNFT;
        
        // Log results for debugging
        if (hasNFT) {
          console.log(`✅ NFT DETECTED for wallet ${wallet.address}`);
          hasAnyNFT = true;
        } else {
          console.log(`❌ NO NFT found for wallet ${wallet.address}`);
        }
      } catch (error) {
        console.error(`Error checking NFT holdings for ${wallet.address}:`, error);
      }
    }
    
    return {
      wallets: verifiedWallets.map(wallet => ({
        address: wallet.address,
        hasNFT: wallet.hasNFT
      })),
      hasAnyNFT
    };
  } catch (error) {
    throw error;
  }
};

module.exports = {
  startVerification,
  checkVerification,
  getUserWallets,
  removeWallet,
  refreshNFTStatus,
  generateRandomAmount
}; 