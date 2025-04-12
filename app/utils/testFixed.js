require('dotenv').config();
const fetch = require('node-fetch');

// Test wallet address provided by the user
const walletAddress = '0x348cd8f60c3482ba36fcc23317d16eb8cf64f135';

// Hardcode the NFT contract address
const NFT_CONTRACT_ADDRESS = process.env.NFT_CONTRACT_ADDRESS || '0xae280ca8dfaaf852b0af828cd72391ce7874fbb6';
const API_KEY = process.env.BLOCKVISION_API_KEY || '2vPWlUoscxTlEDZ6OpaLbfsLhPc';

console.log('Starting NFT detection test for wallet:', walletAddress);
console.log('Using NFT contract address:', NFT_CONTRACT_ADDRESS);
console.log('API Key available:', !!API_KEY);

/**
 * Fixed implementation of NFT detection
 */
const checkNFTHoldings = async (address) => {
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
    console.log(`Looking for NFTs from contract: ${NFT_CONTRACT_ADDRESS}`);
    console.log(`Normalized contract address: ${targetContract}`);
    
    // Try multiple API endpoints to find the NFT
    // API endpoint 1: Web3 endpoint
    try {
      console.log('Trying Web3 NFT API endpoint...');
      const web3Response = await fetch(
        `https://api.blockvision.org/v3/monad/web3/getNFTsForOwner?owner=${address}&contractAddresses[]=${NFT_CONTRACT_ADDRESS}`,
        options
      );
      
      if (web3Response.ok) {
        const data = await web3Response.json();
        console.log('Web3 API response:', JSON.stringify(data).substring(0, 200) + '...');
        
        if (data && data.ownedNfts && data.ownedNfts.length > 0) {
          console.log(`✅ FOUND! Web3 endpoint shows ${data.ownedNfts.length} NFTs from Lil Monaliens contract`);
          return true;
        }
      } else {
        console.log(`Web3 API returned status: ${web3Response.status}`);
      }
    } catch (web3Error) {
      console.error('Error in web3 NFT check:', web3Error);
    }
    
    // API endpoint 2: Direct NFT contract query
    try {
      console.log('Trying direct NFT contract lookup...');
      const directNftResponse = await fetch(
        `https://api.blockvision.org/v2/monad/account/nft?address=${address}&contract=${NFT_CONTRACT_ADDRESS}`,
        options
      );
      
      if (directNftResponse.ok) {
        const data = await directNftResponse.json();
        console.log('Direct NFT API response:', JSON.stringify(data).substring(0, 200) + '...');
        
        if (
          (data && data.result && data.result.data) ||
          (data && data.data) ||
          (data && data.code === 0 && !data.error)
        ) {
          console.log(`✅ FOUND! Direct NFT contract check successful`);
          return true;
        }
      } else {
        console.log(`Direct NFT API returned status: ${directNftResponse.status}`);
      }
    } catch (directError) {
      console.error('Error in direct NFT contract check:', directError);
    }
    
    // API endpoint 3: NFT collections
    try {
      console.log('Trying NFT collections API...');
      
      // Check both verified and unverified NFTs
      for (let page = 1; page <= 5; page++) { // Check first 5 pages
        console.log(`Checking NFT collections page ${page}...`);
        
        const response = await fetch(
          `https://api.blockvision.org/v2/monad/account/nfts?address=${address}&pageIndex=${page}`,
          options
        );
        
        if (!response.ok) {
          console.error(`API error on page ${page}: ${response.status}`);
          break;
        }
        
        const data = await response.json();
        console.log(`Collections API response (page ${page}):`, JSON.stringify(data).substring(0, 200) + '...');
        
        if (data && data.result && data.result.data && Array.isArray(data.result.data)) {
          const collections = data.result.data;
          console.log(`Found ${collections.length} NFT collections on page ${page}`);
          
          if (collections.length === 0) {
            break; // No more collections
          }
          
          // Check for exact contract address match
          const targetCollection = collections.find(c => 
            c.contractAddress && (
              c.contractAddress === NFT_CONTRACT_ADDRESS || 
              c.contractAddress.toLowerCase() === targetContract
            )
          );
          
          if (targetCollection) {
            console.log(`✅ FOUND! This wallet holds the exact NFT collection: ${targetCollection.name || 'Unnamed'}`);
            return true;
          }
          
          // Check individual NFT items for matching contract
          for (const collection of collections) {
            if (collection.items && Array.isArray(collection.items)) {
              const targetItem = collection.items.find(item => 
                item.contractAddress && (
                  item.contractAddress === NFT_CONTRACT_ADDRESS ||
                  item.contractAddress.toLowerCase() === targetContract
                )
              );
              
              if (targetItem) {
                console.log(`✅ FOUND! This wallet holds an NFT item with the target contract address`);
                console.log(`Token ID: ${targetItem.tokenId || 'Unknown'}, Name: ${targetItem.name || 'Unnamed'}`);
                return true;
              }
            }
          }
          
          // Collection name matching
          const relevantKeywords = ['monalien', 'lil monalien'];
          const nameMatches = collections.filter(coll => {
            if (!coll.name) return false;
            const lowerName = coll.name.toLowerCase();
            return relevantKeywords.some(keyword => lowerName.includes(keyword));
          });
          
          if (nameMatches.length > 0) {
            console.log(`✅ FOUND! Collections with relevant name matches: ${nameMatches.map(m => m.name).join(', ')}`);
            return true;
          }
        }
      }
    } catch (collectionError) {
      console.error('Error checking collections:', collectionError);
    }
    
    // API endpoint 4: Tokens list
    try {
      console.log('Trying tokens API endpoint as fallback...');
      const tokenResponse = await fetch(
        `https://api.blockvision.org/v2/monad/account/tokens?address=${address}`,
        options
      );
      
      if (tokenResponse.ok) {
        const data = await tokenResponse.json();
        console.log('Tokens API response:', JSON.stringify(data).substring(0, 200) + '...');
        
        if (data && data.result && data.result.data && Array.isArray(data.result.data)) {
          const tokens = data.result.data;
          
          // Check for tokens with matching contract
          const foundToken = tokens.find(token => 
            token.contractAddress && 
            token.contractAddress.toLowerCase() === targetContract
          );
          
          if (foundToken) {
            console.log(`✅ FOUND! Lil Monaliens token in fallback check`);
            return true;
          }
          
          // Check for tokens with "Monalien" in name
          const nameMatchTokens = tokens.filter(token => {
            if (!token.name) return false;
            return token.name.toLowerCase().includes('monalien');
          });
          
          if (nameMatchTokens.length > 0) {
            console.log(`✅ FOUND! Token with Monalien in name`);
            return true;
          }
        }
      } else {
        console.log(`Tokens API returned status: ${tokenResponse.status}`);
      }
    } catch (tokenError) {
      console.error('Error in token check:', tokenError);
    }
    
    console.log(`❌ No Lil Monaliens NFTs found for address: ${address}`);
    return false;
  } catch (error) {
    console.error('Error in main NFT holdings check:', error);
    return false;
  }
};

// Run the test
async function runTest() {
  console.log('\n------------------------------------------');
  console.log('Testing fixed NFT detection implementation');
  console.log('------------------------------------------');
  
  try {
    const hasNFT = await checkNFTHoldings(walletAddress);
    console.log(`\nRESULT: Wallet ${walletAddress} ${hasNFT ? 'HAS ✅' : 'DOES NOT HAVE ❌'} a Lil Monaliens NFT`);
  } catch (error) {
    console.error('Test failed:', error);
  }
}

runTest(); 