require('dotenv').config();
const fetch = require('node-fetch');

const API_KEY = process.env.BLOCKVISION_API_KEY;
const NFT_CONTRACT_ADDRESS = process.env.NFT_CONTRACT_ADDRESS || '0xae280ca8dfaaf852b0af828cd72391ce7874fbb6';

// Use the wallet address provided by the user
const TEST_WALLET_ADDRESS = '0x348cd8f60c3482ba36fcc23317d16eb8cf64f135';
// Previous test wallet: '0x290b7C691Ee1FB118120f43E1A24d68B45CB27FB';

// Test NFT holdings endpoint
const testNFTHoldings = async () => {
  console.log('Testing NFT holdings endpoint...');
  console.log(`Looking for NFTs from contract: ${NFT_CONTRACT_ADDRESS}`);
  
  const options = {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'x-api-key': API_KEY
    }
  };

  try {
    const response = await fetch(
      `https://api.blockvision.org/v2/monad/account/nfts?address=${TEST_WALLET_ADDRESS}&pageIndex=1`,
      options
    );

    if (!response.ok) {
      throw new Error(`BlockVision API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('NFT API Response:', JSON.stringify(data, null, 2));
    
    // Check data structure type
    console.log('\nAnalyzing response structure...');
    if (data.data && data.data.list) {
      console.log('Using data.data.list structure');
      checkNFTsInList(data.data.list);
    } else if (data.result && data.result.data) {
      console.log('Using data.result.data structure');
      if (Array.isArray(data.result.data)) {
        checkNFTsInList(data.result.data);
      } else {
        console.log('Data is not an array:', typeof data.result.data);
      }
    } else {
      console.log('Unknown data structure:', Object.keys(data));
    }
  } catch (error) {
    console.error('Error testing NFT endpoint:', error);
  }
};

// Helper function to check NFTs in a list
const checkNFTsInList = (nftList) => {
  console.log(`Found ${nftList.length} NFT collections`);
  
  // Print details of all collections
  console.log('\nDetailed collections info:');
  nftList.forEach((collection, index) => {
    console.log(`\nCollection #${index + 1}:`);
    console.log(`- Name: ${collection.name || 'Unnamed'}`);
    console.log(`- Contract: ${collection.contractAddress}`);
    console.log(`- Verified: ${collection.verified ? 'Yes' : 'No'}`);
    console.log(`- ERC Standard: ${collection.ercStandard || 'Unknown'}`);
    
    if (collection.items && Array.isArray(collection.items)) {
      console.log(`- Items: ${collection.items.length}`);
      console.log('  Sample items:');
      const sampleItems = collection.items.slice(0, 3); // Show first 3 items for brevity
      sampleItems.forEach(item => {
        console.log(`  - TokenId: ${item.tokenId}, Name: ${item.name || 'Unnamed'}`);
        console.log(`    Contract: ${item.contractAddress}`);
      });
      
      if (collection.items.length > 3) {
        console.log(`  ... (${collection.items.length - 3} more items)`);
      }
    } else {
      console.log('- Items: None or unknown format');
    }
  });
  
  // Print all contract addresses
  console.log('\nAll contract addresses found:');
  const contractAddresses = new Set();
  nftList.forEach(nft => {
    if (nft.contractAddress) {
      contractAddresses.add(nft.contractAddress.toLowerCase());
      console.log(`- ${nft.contractAddress} (${nft.verified ? 'Verified' : 'Unverified'})`);
    }
  });
  
  // Also check for contract addresses in items (important!)
  nftList.forEach(collection => {
    if (collection.items && Array.isArray(collection.items)) {
      collection.items.forEach(item => {
        if (item.contractAddress && 
            !contractAddresses.has(item.contractAddress.toLowerCase())) {
          contractAddresses.add(item.contractAddress.toLowerCase());
          console.log(`- ${item.contractAddress} (In Items Array)`);
        }
      });
    }
  });
  
  // Check for our target contract at both collection and item level
  let hasTargetNFT = false;
  let targetLocation = "";
  
  // First check collections
  for (const collection of nftList) {
    if (collection.contractAddress && 
        collection.contractAddress.toLowerCase() === NFT_CONTRACT_ADDRESS.toLowerCase()) {
      hasTargetNFT = true;
      targetLocation = `in collection "${collection.name || 'Unnamed'}" (Verified: ${collection.verified ? 'Yes' : 'No'})`;
      break;
    }
    
    // Then check items
    if (collection.items && Array.isArray(collection.items)) {
      for (const item of collection.items) {
        if (item.contractAddress && 
            item.contractAddress.toLowerCase() === NFT_CONTRACT_ADDRESS.toLowerCase()) {
          hasTargetNFT = true;
          targetLocation = `as item in collection "${collection.name || 'Unnamed'}"`;
          break;
        }
      }
      if (hasTargetNFT) break;
    }
  }
  
  console.log(`\nTarget contract: ${NFT_CONTRACT_ADDRESS}`);
  console.log(`Has Lil Monalien NFT: ${hasTargetNFT ? '✅ YES' : '❌ NO'}`);
  if (hasTargetNFT) {
    console.log(`Found ${targetLocation}`);
  }
  
  if (hasTargetNFT) {
    console.log('\nLil Monalien NFTs found:');
    // Find all matching items across all collections
    let matchingItems = [];
    
    nftList.forEach(collection => {
      // Check if collection itself matches
      if (collection.contractAddress && 
          collection.contractAddress.toLowerCase() === NFT_CONTRACT_ADDRESS.toLowerCase()) {
        console.log(`Collection: ${collection.name || 'Unnamed'} (${collection.items?.length || 0} items)`);
        console.log(`Verified: ${collection.verified ? 'Yes' : 'No'}`);
        
        if (collection.items) {
          matchingItems = [...matchingItems, ...collection.items];
        }
      } else if (collection.items && Array.isArray(collection.items)) {
        // Check for matching items
        const matchingFromCollection = collection.items.filter(item => 
          item.contractAddress && 
          item.contractAddress.toLowerCase() === NFT_CONTRACT_ADDRESS.toLowerCase()
        );
        
        if (matchingFromCollection.length > 0) {
          console.log(`Found ${matchingFromCollection.length} items in collection "${collection.name || 'Unnamed'}"`);
          matchingItems = [...matchingItems, ...matchingFromCollection];
        }
      }
    });
    
    // Display matching items
    if (matchingItems.length > 0) {
      console.log(`\nTotal matching items: ${matchingItems.length}`);
      matchingItems.forEach(item => {
        console.log('-----------------------');
        console.log(`TokenId: ${item.tokenId}`);
        console.log(`Name: ${item.name || 'N/A'}`);
        console.log(`Contract: ${item.contractAddress}`);
        if (item.imageUrl) console.log(`Image: ${item.imageUrl}`);
      });
    } else {
      console.log('No individual items found with matching contract address');
    }
  }
};

// Test transactions endpoint
const testTransactions = async () => {
  console.log('\nTesting transactions endpoint...');
  
  const options = {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'x-api-key': API_KEY
    }
  };

  try {
    const response = await fetch(
      `https://api.blockvision.org/v2/monad/account/transactions?address=${TEST_WALLET_ADDRESS}&limit=20`,
      options
    );

    if (!response.ok) {
      throw new Error(`BlockVision API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('Transactions API Response (first 500 chars):', JSON.stringify(data).substring(0, 500) + '...');
    
    // Check data structure
    if (data.result && data.result.data && Array.isArray(data.result.data)) {
      console.log(`Found ${data.result.data.length} transactions`);
    } else {
      console.log('Unexpected transaction data structure');
    }
  } catch (error) {
    console.error('Error testing transactions endpoint:', error);
  }
};

const runTests = async () => {
  await testNFTHoldings();
  await testTransactions();
  
  // Test the actual NFT verification function used by the bot
  console.log('\n------------------------------------------');
  console.log('Testing the checkNFTHoldings function directly');
  console.log('------------------------------------------');
  const { checkNFTHoldings } = require('./blockVisionApi');
  try {
    console.log(`Checking if wallet ${TEST_WALLET_ADDRESS} holds a Lil Monaliens NFT...`);
    const hasNFT = await checkNFTHoldings(TEST_WALLET_ADDRESS);
    console.log(`\nRESULT: Wallet ${TEST_WALLET_ADDRESS} ${hasNFT ? 'HAS ✅' : 'DOES NOT HAVE ❌'} a Lil Monaliens NFT`);
  } catch (error) {
    console.error('Error testing checkNFTHoldings function:', error);
  }
};

runTests(); 