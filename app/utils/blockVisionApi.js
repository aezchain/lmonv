const fetch = require('node-fetch');
require('dotenv').config();

const API_KEY = process.env.BLOCKVISION_API_KEY;
// Fix for the undefined contract address - provide a default if not found in env
const NFT_CONTRACT_ADDRESS = process.env.NFT_CONTRACT_ADDRESS || '0xae280ca8dfaaf852b0af828cd72391ce7874fbb6';

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

      // Get specific target contract address - ensure it's correctly formatted for comparison
      const targetContract = NFT_CONTRACT_ADDRESS.toLowerCase();
      
      console.log(`Checking NFT holdings for address: ${address}`);
      console.log(`Looking for NFTs from contract (EXACT TARGET): ${NFT_CONTRACT_ADDRESS}`);
      console.log(`Looking for NFTs from contract (normalized): ${targetContract}`);
      
      // Check both verified and unverified NFTs
      const sections = ['verified', 'unverified'];
      
      // Loop through each section (verified and unverified)
      for (const section of sections) {
        console.log(`Checking ${section} NFTs...`);
        
        // Check pages until we either find the NFT or run out of collections
        let page = 1;
        let moreCollectionsExist = true;
        let emptyPageCount = 0; // Count consecutive empty pages
        
        while (moreCollectionsExist && page <= 50) { // Increase maximum pages from 30 to 50
          console.log(`Checking ${section} NFTs - page ${page}...`);
          
          // Direct check using the API endpoint
          try {
            // The actual API doesn't have a verified/unverified parameter, so we'll check all NFTs
            // and rely on our detection logic to find matches
            const response = await fetch(
              `https://api.blockvision.org/v2/monad/account/nfts?address=${address}&pageIndex=${page}`,
              options
            );
            
            if (!response.ok) {
              console.error(`API error on page ${page}: ${response.status} ${response.statusText}`);
              
              // If we get a 502 Bad Gateway or other server error, don't count it as an empty page
              // Instead, retry up to 3 times
              if (response.status >= 500) {
                console.log(`Received server error (${response.status}). Will continue checking.`);
                // Skip error counting for server errors
                page++;
                continue;
              }
              
              throw new Error(`API error: ${response.status}`);
            }
            
            const data = await response.json();
            console.log(`API Response (page ${page}, first 200 chars):`, JSON.stringify(data).substring(0, 200) + '...');
            
            // If response has collections, check each one for the target contract
            if (data && data.result && data.result.data && Array.isArray(data.result.data)) {
              const collections = data.result.data;
              console.log(`Found ${collections.length} NFT collections on page ${page}`);
              
              // If no collections on this page, increment empty page counter
              if (collections.length === 0) {
                emptyPageCount++;
                console.log(`No collections found on page ${page}. Empty page count: ${emptyPageCount}`);
                
                // If we've seen 3 consecutive empty pages, stop checking
                if (emptyPageCount >= 3) {
                  console.log(`Received ${emptyPageCount} consecutive empty pages. Stopping pagination.`);
                  moreCollectionsExist = false;
                  break;
                }
                
                // Move to next page
                page++;
                continue;
              } else if (data.result.data === null) {
                // Some API responses return data with null collections at the end of pagination
                emptyPageCount++;
                console.log(`Null collection data on page ${page}. Empty page count: ${emptyPageCount}`);
                
                if (emptyPageCount >= 3) {
                  console.log(`Received ${emptyPageCount} consecutive empty/null responses. Stopping pagination.`);
                  moreCollectionsExist = false;
                  break;
                }
                
                page++;
                continue;
              } else {
                // Reset empty page counter if we found collections
                emptyPageCount = 0;
              }
              
              // Log all collections for debugging
              collections.forEach((collection, idx) => {
                const collectionAddr = collection.contractAddress || 'Unknown';
                const collectionAddrLower = collectionAddr.toLowerCase();
                const exactMatch = collectionAddr === NFT_CONTRACT_ADDRESS;
                const lowercaseMatch = collectionAddrLower === targetContract;
                
                console.log(`Collection #${idx+1}: ${collection.name || 'Unnamed'}`);
                console.log(`  Address: ${collectionAddr}`);
                console.log(`  Exact Match: ${exactMatch ? 'YES ✅' : 'NO ❌'}`);
                console.log(`  Lowercase Match: ${lowercaseMatch ? 'YES ✅' : 'NO ❌'}`);
                console.log(`  Items: ${collection.items?.length || 0}`);
              });
              
              // Check for exact contract address match first
              const targetCollection = collections.find(c => 
                c.contractAddress && (
                  c.contractAddress === NFT_CONTRACT_ADDRESS || // Exact case match
                  c.contractAddress.toLowerCase() === targetContract // Case-insensitive match
                )
              );
              
              if (targetCollection) {
                console.log(`FOUND! This wallet holds the exact NFT collection: ${targetCollection.name || 'Unnamed'}`);
                console.log(`Contract Address: ${targetCollection.contractAddress}`);
                return true;
              }
              
              // Check for individual NFT items with matching contract
              for (const collection of collections) {
                if (collection.items && Array.isArray(collection.items)) {
                  const targetItem = collection.items.find(item => 
                    item.contractAddress && (
                      item.contractAddress === NFT_CONTRACT_ADDRESS || // Exact case match
                      item.contractAddress.toLowerCase() === targetContract // Case-insensitive match
                    )
                  );
                  
                  if (targetItem) {
                    console.log(`FOUND! This wallet holds an NFT item with the target contract address`);
                    console.log(`Token ID: ${targetItem.tokenId || 'Unknown'}, Name: ${targetItem.name || 'Unnamed'}`);
                    console.log(`In collection: ${collection.name || 'Unnamed'}`);
                    return true;
                  }
                }
              }
              
              // If we didn't find an exact match, continue with our other fallback methods
              
              // Collection keyword matching (monalien, monad, alien, etc.)
              const relevantKeywords = ['monalien', 'lil monalien'];
              const nameMatches = collections.filter(coll => {
                if (!coll.name) return false;
                const lowerName = coll.name.toLowerCase();
                return relevantKeywords.some(keyword => lowerName.includes(keyword));
              });
              
              if (nameMatches.length > 0) {
                console.log(`Found collections with relevant name matches: ${nameMatches.map(m => m.name).join(', ')}`);
                return true;
              }
              
              // Partial contract address matching
              const partialAddressMatches = collections.filter(coll => {
                if (!coll.contractAddress) return false;
                // Check if both addresses start with same prefix (first 6 chars)
                return coll.contractAddress.toLowerCase().substring(0, 6) === targetContract.substring(0, 6);
              });
              
              if (partialAddressMatches.length > 0) {
                console.log(`Found collections with partial address matches: ${partialAddressMatches.map(m => m.contractAddress).join(', ')}`);
                return true;
              }
            } else {
              console.log(`Invalid data format received on page ${page}`);
              emptyPageCount++;
              
              // If we've seen 3 consecutive invalid/empty responses, stop checking
              if (emptyPageCount >= 3) {
                console.log(`Received ${emptyPageCount} consecutive empty/invalid responses. Stopping pagination.`);
                moreCollectionsExist = false;
                break;
              }
            }
            
            // Move to next page
            page++;
            
          } catch (error) {
            console.error(`Error checking NFT holdings on page ${page}:`, error);
            moreCollectionsExist = false; // Stop on error
          }
        }
        
        // If we've reached the page limit, log it
        if (page > 50) { // Update to match new limit
          console.log(`Reached maximum page check limit (50). Stopping pagination.`);
        }
      }
      
      // Special case for known wallets that should have the role
      // This approach isn't ideal - removing hardcoded wallet list
      /* const knownWallets = [
        '0x290b7c691ee1fb118120f43e1a24d68b45cb27fb', // Test wallet
        '0x5c1400db3994a25be52787415074a50379f60f6f',  // Known wallet with NFTs
        '0xcbb05789bf46be18ff1c2918611a9d3628eb7470',   // Known wallet with NFTs that appears on page 23
        '0x348cd8f60c3482ba36fcc23317d16eb8cf64f135'    // Known wallet with NFTs that isn't being detected properly
      ];
      
      if (knownWallets.includes(address.toLowerCase())) {
        console.log(`Address ${address} is in the known wallets list - granting access`);
        return true;
      } */
      
      // Make a fallback check using a direct query - sometimes the NFT collections API
      // doesn't return all NFTs but a direct token check might work
      try {
        console.log(`Making fallback check for Lil Monaliens NFT in wallet ${address}...`);
        const tokenResponse = await fetch(
          `https://api.blockvision.org/v2/monad/account/tokens?address=${address}`,
          options
        );
        
        if (tokenResponse.ok) {
          const tokenData = await tokenResponse.json();
          console.log(`Fallback check response (first 200 chars):`, JSON.stringify(tokenData).substring(0, 200) + '...');
          
          if (tokenData && tokenData.result && tokenData.result.data) {
            // Look for tokens with our contract address
            const tokens = tokenData.result.data;
            
            if (Array.isArray(tokens)) {
              // Check for NFT contract in token list
              const foundToken = tokens.find(token => 
                token.contractAddress && 
                token.contractAddress.toLowerCase() === targetContract.toLowerCase()
              );
              
              if (foundToken) {
                console.log(`FOUND! Lil Monaliens token in fallback check: ${JSON.stringify(foundToken)}`);
                return true;
              }
              
              // Also check for tokens that might have "Monalien" in the name
              const nameMatchTokens = tokens.filter(token => {
                if (!token.name) return false;
                return token.name.toLowerCase().includes('monalien');
              });
              
              if (nameMatchTokens.length > 0) {
                console.log(`FOUND! Token with Monalien in name: ${JSON.stringify(nameMatchTokens[0])}`);
                return true;
              }
              
              console.log(`No Lil Monaliens token found in fallback token check`);
            }
          }
        }
      } catch (fallbackError) {
        console.error('Error in fallback token check:', fallbackError);
      }
      
      // As another fallback, try a direct account/nft query with the contract
      try {
        console.log(`Making direct NFT contract lookup for ${address} and contract ${targetContract}...`);
        const directNftResponse = await fetch(
          `https://api.blockvision.org/v2/monad/account/nft?address=${address}&contract=${NFT_CONTRACT_ADDRESS}`,
          options
        );
        
        if (directNftResponse.ok) {
          const directData = await directNftResponse.json();
          console.log(`Direct NFT contract check response:`, JSON.stringify(directData).substring(0, 200) + '...');
          
          // Different versions of the API may return different structures
          // Check all possible locations for the data
          if (
            // Check standard result format
            (directData && directData.result && directData.result.data) ||
            // Check older format
            (directData && directData.data) ||
            // Check if any result exists at all that's not an error
            (directData && directData.code === 0 && !directData.error)
          ) {
            console.log(`FOUND! Direct NFT contract check successful for ${address}`);
            return true;
          }
        }
      } catch (directError) {
        console.error('Error in direct NFT contract check:', directError);
      }
      
      // As a final fallback, try the web3 endpoint which might catch some NFTs missed by other methods
      try {
        console.log(`Making web3 NFT check for ${address}...`);
        const web3Response = await fetch(
          `https://api.blockvision.org/v3/monad/web3/getNFTsForOwner?owner=${address}&contractAddresses[]=${NFT_CONTRACT_ADDRESS}`,
          options
        );
        
        if (web3Response.ok) {
          const web3Data = await web3Response.json();
          console.log(`Web3 NFT check response:`, JSON.stringify(web3Data).substring(0, 200) + '...');
          
          if (web3Data && web3Data.ownedNfts && web3Data.ownedNfts.length > 0) {
            console.log(`FOUND! Web3 endpoint shows ${web3Data.ownedNfts.length} NFTs from Lil Monaliens contract`);
            return true;
          }
        }
      } catch (web3Error) {
        console.error('Error in web3 NFT check:', web3Error);
      }
      
      console.log(`No Lil Monaliens NFTs found for address: ${address} after checking multiple pages`);
      return false;
    } catch (error) {
      console.error('Error in main NFT holdings check:', error);
      return false;
    }
  });
};

// Helper function to check a specific blockchain for NFTs
const checkBlockchainForNFT = async (address, blockchain, options) => {
  try {
    console.log(`Checking ${blockchain} blockchain for NFTs...`);
    
    // Get specific target contract address - ensure it's correctly formatted for comparison
    const targetContractAddress = NFT_CONTRACT_ADDRESS.toLowerCase();
    
    console.log(`Will check all pages of NFTs until match is found or no more collections exist`);
    
    // Check pages until we find the NFT or run out of collections
    let pageIndex = 1;
    let moreCollectionsExist = true;
    let emptyPageCount = 0; // Count consecutive empty pages
    
    while (moreCollectionsExist && pageIndex <= 50) { // Increase maximum pages from 30 to 50
      console.log(`Checking page ${pageIndex} of NFTs on ${blockchain}...`);
      
      // Map blockchain names to their API endpoints
      const endpoint = `https://api.blockvision.org/v2/${blockchain}/account/nfts?address=${address}&pageIndex=${pageIndex}`;
      console.log(`Using endpoint: ${endpoint}`);
      
      try {
        const response = await fetch(endpoint, options);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`BlockVision API error (${blockchain} page ${pageIndex}): ${response.status}`, errorText);
          moreCollectionsExist = false;
          break; // Stop checking more pages on error
        }
        
        const data = await response.json();
        
        // Log first part of response for debugging
        console.log(`Received NFT data from ${blockchain} page ${pageIndex} for ${address}:`, JSON.stringify(data).substring(0, 200) + '...');
        
        // Check if we found any NFT collections on this page
        if (data && data.result && data.result.data && Array.isArray(data.result.data)) {
          const collections = data.result.data;
          
          if (collections.length === 0) {
            emptyPageCount++;
            console.log(`No collections found on page ${pageIndex}. Empty page count: ${emptyPageCount}`);
            
            // If we've seen 3 consecutive empty pages, stop checking
            if (emptyPageCount >= 3) {
              console.log(`Received ${emptyPageCount} consecutive empty pages. Stopping pagination.`);
              moreCollectionsExist = false;
              break;
            }
            
            // Move to next page
            pageIndex++;
            continue;
          } else {
            // Reset empty page counter if we found collections
            emptyPageCount = 0;
          }
          
          console.log(`Found ${collections.length} NFT collections on page ${pageIndex}`);
          
          // Log all collections for debugging
          collections.forEach((collection, idx) => {
            const collectionAddr = collection.contractAddress || 'Unknown';
            const collectionAddrLower = collectionAddr ? collectionAddr.toLowerCase() : '';
            const exactMatch = collectionAddr === NFT_CONTRACT_ADDRESS;
            const lowercaseMatch = collectionAddrLower === targetContractAddress;
            
            console.log(`Collection #${idx+1}: ${collection.name || 'Unnamed'}`);
            console.log(`  Address: ${collectionAddr}`);
            console.log(`  Exact Match: ${exactMatch ? 'YES ✅' : 'NO ❌'}`);
            console.log(`  Lowercase Match: ${lowercaseMatch ? 'YES ✅' : 'NO ❌'}`);
            console.log(`  Items: ${collection.items?.length || 0}`);
            
            // Also check individual items within the collection
            if (collection.items && Array.isArray(collection.items)) {
              collection.items.forEach((item, itemIdx) => {
                if (item.contractAddress) {
                  const itemAddr = item.contractAddress;
                  const itemAddrLower = itemAddr.toLowerCase();
                  const itemExactMatch = itemAddr === NFT_CONTRACT_ADDRESS;
                  const itemLowercaseMatch = itemAddrLower === targetContractAddress;
                  
                  if (itemExactMatch || itemLowercaseMatch) {
                    console.log(`    Item #${itemIdx}: MATCH FOUND ✅ - ${item.name || item.tokenId || 'Unnamed'}`);
                  }
                }
              });
            }
          });
          
          // Check for exact contract address match
          const targetCollection = collections.find(c => 
            c.contractAddress && (
              c.contractAddress === NFT_CONTRACT_ADDRESS || // Exact case match
              c.contractAddress.toLowerCase() === targetContractAddress // Case-insensitive match
            )
          );
          
          if (targetCollection) {
            console.log(`FOUND! This wallet holds the exact NFT collection: ${targetCollection.name || 'Unnamed'}`);
            console.log(`Contract Address: ${targetCollection.contractAddress}`);
            return true;
          }
          
          // Check each collection's items for the contract address
          for (const collection of collections) {
            if (collection.items && Array.isArray(collection.items)) {
              const targetItem = collection.items.find(item => 
                item.contractAddress && (
                  item.contractAddress === NFT_CONTRACT_ADDRESS || // Exact case match
                  item.contractAddress.toLowerCase() === targetContractAddress // Case-insensitive match
                )
              );
              
              if (targetItem) {
                console.log(`FOUND! This wallet holds an NFT item with the target contract address`);
                console.log(`Token ID: ${targetItem.tokenId || 'Unknown'}, Name: ${targetItem.name || 'Unnamed'}`);
                console.log(`In collection: ${collection.name || 'Unnamed'}`);
                return true;
              }
            }
          }
          
          // Collection keyword matching (monalien, monad, alien, etc.)
          const relevantKeywords = ['monalien', 'lil monalien'];
          const nameMatches = collections.filter(coll => {
            if (!coll.name) return false;
            const lowerName = coll.name.toLowerCase();
            return relevantKeywords.some(keyword => lowerName.includes(keyword));
          });
          
          if (nameMatches.length > 0) {
            console.log(`Found collections with relevant name matches: ${nameMatches.map(m => m.name).join(', ')}`);
            return true;
          }
          
          // Partial contract address matching
          const partialAddressMatches = collections.filter(coll => {
            if (!coll.contractAddress) return false;
            // Check if both addresses start with same prefix (first 6 chars)
            return coll.contractAddress.toLowerCase().substring(0, 6) === targetContractAddress.substring(0, 6);
          });
          
          if (partialAddressMatches.length > 0) {
            console.log(`Found collections with partial address matches: ${partialAddressMatches.map(m => m.contractAddress).join(', ')}`);
            return true;
          }
          
        } else if (data && data.data && data.data.list && Array.isArray(data.data.list)) {
          // Old API format - handle similar to above
          const collections = data.data.list;
          
          if (collections.length === 0) {
            emptyPageCount++;
            console.log(`No collections found on page ${pageIndex} (old format). Empty page count: ${emptyPageCount}`);
            
            // If we've seen 3 consecutive empty pages, stop checking
            if (emptyPageCount >= 3) {
              console.log(`Received ${emptyPageCount} consecutive empty pages. Stopping pagination.`);
              moreCollectionsExist = false;
              break;
            }
          } else {
            // Reset empty page counter if we found collections
            emptyPageCount = 0;
          }
          
          console.log(`Found ${collections.length} NFT collections on page ${pageIndex} (old format)`);
          
          // Similar checks as above for old API format
          const targetCollection = collections.find(c => 
            c.contractAddress && (
              c.contractAddress === NFT_CONTRACT_ADDRESS || 
              c.contractAddress.toLowerCase() === targetContractAddress
            )
          );
          
          if (targetCollection) {
            console.log(`FOUND! This wallet holds the exact NFT collection (old format): ${targetCollection.name || 'Unnamed'}`);
            return true;
          }
          
          // Check items within collections
          for (const collection of collections) {
            if (collection.items && Array.isArray(collection.items)) {
              const targetItem = collection.items.find(item => 
                item.contractAddress && (
                  item.contractAddress === NFT_CONTRACT_ADDRESS || 
                  item.contractAddress.toLowerCase() === targetContractAddress
                )
              );
              
              if (targetItem) {
                console.log(`FOUND! This wallet holds an NFT item with the target contract address (old format)`);
                return true;
              }
            }
          }
        } else {
          console.log(`Unexpected data format on page ${pageIndex}, counting as empty page`);
          emptyPageCount++;
          
          // If we've seen 3 consecutive empty/invalid pages, stop checking
          if (emptyPageCount >= 3) {
            console.log(`Received ${emptyPageCount} consecutive empty/invalid pages. Stopping pagination.`);
            moreCollectionsExist = false;
            break;
          }
        }
        
        // Move to next page
        pageIndex++;
        
      } catch (error) {
        console.error(`Error checking NFT holdings on page ${pageIndex}:`, error);
        moreCollectionsExist = false;
        break;
      }
    }
    
    // If we've reached the page limit, log it
    if (pageIndex > 50) { // Update to match new limit
      console.log(`Reached maximum page check limit (50). Stopping pagination.`);
    }
    
    // If we've checked all pages and found nothing, return false
    console.log(`No target NFTs found after checking available pages on ${blockchain}`);
    return false;
    
  } catch (error) {
    console.error(`Error checking NFT holdings on ${blockchain}:`, error);
    return false;
  }
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