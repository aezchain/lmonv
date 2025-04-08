const fetch = require('node-fetch');
require('dotenv').config();

const API_KEY = process.env.BLOCKVISION_API_KEY;
const NFT_CONTRACT_ADDRESS = process.env.NFT_CONTRACT_ADDRESS;

// Rate limiter to ensure we don't exceed 2 queries per second
const queue = [];
let processing = false;

const processQueue = async () => {
  if (processing || queue.length === 0) return;
  
  processing = true;
  const { task, resolve, reject } = queue.shift();
  
  try {
    const result = await task();
    resolve(result);
  } catch (error) {
    reject(error);
  }
  
  processing = false;
  setTimeout(() => processQueue(), 500); // Ensure ~2 queries per second
};

const enqueue = (task) => {
  return new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    if (!processing) processQueue();
  });
};

// Check if a wallet holds NFTs from the Lil Monaliens contract
const checkNFTHoldings = async (address) => {
  return enqueue(async () => {
    try {
      if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
        console.error('Invalid address format:', address);
        return false;
      }
      
      const options = {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'x-api-key': API_KEY
        }
      };

      console.log(`Checking NFT holdings for address: ${address}`);
      console.log(`Looking for NFTs from contract: ${NFT_CONTRACT_ADDRESS}`);
      
      const response = await fetch(
        `https://api.blockvision.org/v2/monad/account/nfts?address=${address}&pageIndex=1`,
        options
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`BlockVision API error: ${response.status}`, errorText);
        return false;
      }

      const data = await response.json();
      
      // Log first part of response for debugging
      console.log(`Received NFT data for ${address}:`, JSON.stringify(data).substring(0, 200) + '...');
      
      // Main data structure (as confirmed in test)
      if (data && data.result && data.result.data && Array.isArray(data.result.data)) {
        console.log(`Found ${data.result.data.length} NFT collections in the wallet`);
        
        // LOGGING ALL COLLECTIONS INCLUDING VERIFICATION STATUS
        console.log("All collections found (including verification status):");
        data.result.data.forEach(collection => {
          console.log(`- Contract: ${collection.contractAddress}, Name: ${collection.name || 'Unnamed'}, Verified: ${collection.verified}`);
          console.log(`  Items: ${collection.items?.length || 0}`);
        });
        
        // Log all contract addresses for debugging
        const contractAddresses = new Set();
        data.result.data.forEach(nft => {
          if (nft.contractAddress) {
            contractAddresses.add(nft.contractAddress.toLowerCase());
          }
        });
        console.log('Contract addresses found:', Array.from(contractAddresses));
        
        // Check each NFT collection, and within each collection check the items
        let hasTargetNFT = false;
        
        for (const collection of data.result.data) {
          // Check the collection address directly
          if (collection.contractAddress && 
              collection.contractAddress.toLowerCase() === NFT_CONTRACT_ADDRESS.toLowerCase()) {
            console.log(`Found collection matching target address: ${collection.name || 'Unnamed'}`);
            hasTargetNFT = true;
            break;
          }
          
          // Check each item's contract address
          if (collection.items && Array.isArray(collection.items)) {
            for (const item of collection.items) {
              if (item.contractAddress && 
                  item.contractAddress.toLowerCase() === NFT_CONTRACT_ADDRESS.toLowerCase()) {
                console.log(`Found NFT item matching target address in collection: ${collection.name || 'Unnamed'}`);
                hasTargetNFT = true;
                break;
              }
            }
            if (hasTargetNFT) break;
          }
        }
        
        console.log(`Has Lil Monalien NFT: ${hasTargetNFT ? 'YES ✅' : 'NO ❌'}`);
        return hasTargetNFT;
      } 
      // Fallback for original data structure (data.data.list)
      else if (data && data.data && data.data.list && Array.isArray(data.data.list)) {
        console.log(`Found ${data.data.list.length} NFT collections in the wallet (old structure)`);
        
        // Check each NFT collection, and within each collection check the items
        let hasTargetNFT = false;
        
        for (const collection of data.data.list) {
          // Check the collection address directly
          if (collection.contractAddress && 
              collection.contractAddress.toLowerCase() === NFT_CONTRACT_ADDRESS.toLowerCase()) {
            console.log(`Found collection matching target address: ${collection.name || 'Unnamed'}`);
            hasTargetNFT = true;
            break;
          }
          
          // Check each item's contract address
          if (collection.items && Array.isArray(collection.items)) {
            for (const item of collection.items) {
              if (item.contractAddress && 
                  item.contractAddress.toLowerCase() === NFT_CONTRACT_ADDRESS.toLowerCase()) {
                console.log(`Found NFT item matching target address in collection: ${collection.name || 'Unnamed'}`);
                hasTargetNFT = true;
                break;
              }
            }
            if (hasTargetNFT) break;
          }
        }
        
        console.log(`Has Lil Monalien NFT: ${hasTargetNFT ? 'YES ✅' : 'NO ❌'}`);
        return hasTargetNFT;
      }
      
      console.log('No NFTs found or unsupported data structure');
      return false;
    } catch (error) {
      console.error('Error checking NFT holdings:', error);
      return false;
    }
  });
};

// Check if a specific transaction amount has been sent
const checkTransactions = async (address, expectedAmount) => {
  return enqueue(async () => {
    try {
      if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
        console.error('Invalid address format:', address);
        return false;
      }
      
      if (!expectedAmount || isNaN(parseFloat(expectedAmount))) {
        console.error('Invalid expected amount:', expectedAmount);
        return false;
      }
      
      const options = {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'x-api-key': API_KEY
        }
      };

      console.log(`Checking transactions for address: ${address}, expecting amount: ${expectedAmount}`);
      const response = await fetch(
        `https://api.blockvision.org/v2/monad/account/transactions?address=${address}&limit=20`,
        options
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`BlockVision API error: ${response.status}`, errorText);
        return false;
      }

      const data = await response.json();
      console.log(`Received transaction data for ${address}`);
      
      // Convert expected amount from ETH to Wei for comparison
      // 1 MON = 10^18 Wei
      const expectedAmountNum = parseFloat(expectedAmount);
      const expectedAmountWei = BigInt(Math.floor(expectedAmountNum * 1000000)) * BigInt(10**12); // Convert to Wei
      console.log(`Looking for transactions with amount: ${expectedAmount} MON (${expectedAmountWei} Wei)`);
      
      // Check if there's a transaction with the expected amount
      if (data && data.result && data.result.data && Array.isArray(data.result.data)) {
        const transactions = data.result.data;
        const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
        
        console.log(`Found ${transactions.length} transactions, checking for matches...`);
        
        // Look for transactions that match our criteria
        const matchingTransactions = transactions.filter(tx => {
          // Check if this is a MON transfer to self with the exact amount
          const txTimestamp = parseInt(tx.timestamp);
          const isSelfTransfer = tx.from && tx.to && 
                                tx.from.toLowerCase() === address.toLowerCase() && 
                                tx.to.toLowerCase() === address.toLowerCase();
          
          // Convert Wei string to BigInt for comparison
          let txAmountWei;
          try {
            txAmountWei = BigInt(tx.value || '0');
          } catch (e) {
            console.error(`Error parsing transaction amount: ${tx.value}`, e);
            return false;
          }
          
          // Check if timestamp is within last 10 minutes and amount matches
          const isRecentEnough = txTimestamp > tenMinutesAgo;
          
          // Allow for a small margin of error in the amount (0.1%)
          const marginWei = expectedAmountWei / BigInt(1000); // 0.1% margin
          const amountMatchesWithMargin = 
            txAmountWei >= (expectedAmountWei - marginWei) && 
            txAmountWei <= (expectedAmountWei + marginWei);
          
          // For debugging
          if (isSelfTransfer) {
            const txAmountMON = Number(txAmountWei) / 10**18;
            console.log(`Found self-transfer! Hash: ${tx.hash}`);
            console.log(`Amount: ${txAmountWei} Wei (${txAmountMON} MON)`);
            console.log(`Expected: ${expectedAmountWei} Wei (${expectedAmountNum} MON)`);
            console.log(`Recent enough: ${isRecentEnough}, Amount matches: ${amountMatchesWithMargin}`);
          }
          
          if (isSelfTransfer && isRecentEnough && amountMatchesWithMargin) {
            console.log(`Found matching transaction: ${tx.hash}, amount: ${tx.value} Wei`);
            return true;
          }
          return false;
        });
        
        if (matchingTransactions.length > 0) {
          console.log(`Found ${matchingTransactions.length} matching transactions`);
          return true;
        } else {
          console.log('No matching transactions found');
          
          // For debugging, show all self-transfers
          const allSelfTransfers = transactions.filter(tx => 
            tx.from && tx.to && 
            tx.from.toLowerCase() === address.toLowerCase() && 
            tx.to.toLowerCase() === address.toLowerCase()
          );
          
          if (allSelfTransfers.length > 0) {
            console.log(`Found ${allSelfTransfers.length} self-transfers but none matched the criteria:`);
            allSelfTransfers.forEach(tx => {
              const txAmountWei = BigInt(tx.value || '0');
              const txAmountMON = Number(txAmountWei) / 10**18;
              console.log(`Hash: ${tx.hash}, Amount: ${txAmountMON} MON, Timestamp: ${new Date(parseInt(tx.timestamp)).toISOString()}`);
            });
          } else {
            console.log('No self-transfers found at all');
          }
          
          return false;
        }
      }
      
      console.log('Invalid response structure or no transaction data');
      return false;
    } catch (error) {
      console.error('Error checking transactions:', error);
      return false;
    }
  });
};

module.exports = {
  checkNFTHoldings,
  checkTransactions
}; 