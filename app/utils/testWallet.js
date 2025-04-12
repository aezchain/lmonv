require('dotenv').config();

// Test wallet address provided by the user
const walletAddress = '0x348cd8f60c3482ba36fcc23317d16eb8cf64f135';
const mockDiscordId = 'test_user_123';

// Fix for the missing contract address issue
// Make sure contract address is available
const NFT_CONTRACT_ADDRESS = process.env.NFT_CONTRACT_ADDRESS || '0xae280ca8dfaaf852b0af828cd72391ce7874fbb6';
console.log('Environment variables loaded:');
console.log('NFT_CONTRACT_ADDRESS:', process.env.NFT_CONTRACT_ADDRESS);
console.log('Using NFT_CONTRACT_ADDRESS:', NFT_CONTRACT_ADDRESS);

async function testWalletNFT() {
  try {
    // Import modules
    const verificationManager = require('./verificationManager');
    const blockVisionApi = require('./blockVisionApi');

    // First let's test a direct custom implementation of the NFT check
    console.log('\n------------------------------------------');
    console.log('Custom direct NFT check implementation');
    console.log('------------------------------------------');
    
    // Use this to bypass errors in the original code
    const checkNFTDirectly = async (address) => {
      try {
        console.log(`Checking if ${address} has NFT from contract ${NFT_CONTRACT_ADDRESS}...`);
        const API_KEY = process.env.BLOCKVISION_API_KEY;
        const fetch = require('node-fetch');
        
        const options = {
          method: 'GET',
          headers: {
            accept: 'application/json',
            'x-api-key': API_KEY
          }
        };
        
        const response = await fetch(
          `https://api.blockvision.org/v3/monad/web3/getNFTsForOwner?owner=${address}&contractAddresses[]=${NFT_CONTRACT_ADDRESS}`,
          options
        );
        
        if (!response.ok) {
          console.error(`API error: ${response.status} ${response.statusText}`);
          return false;
        }
        
        const data = await response.json();
        console.log('API Response:', JSON.stringify(data).substring(0, 200) + '...');
        
        if (data && data.ownedNfts && data.ownedNfts.length > 0) {
          console.log(`Found ${data.ownedNfts.length} NFTs from Lil Monaliens contract`);
          return true;
        }
        
        console.log('No Lil Monaliens NFTs found');
        return false;
      } catch (error) {
        console.error('Error checking NFT directly:', error);
        return false;
      }
    };
    
    const hasNFTDirect = await checkNFTDirectly(walletAddress);
    console.log(`\nDirect custom check result: Wallet ${walletAddress} ${hasNFTDirect ? 'HAS ✅' : 'DOES NOT HAVE ❌'} a Lil Monaliens NFT`);
    
    // Test the original checkNFTHoldings function 
    console.log('\n------------------------------------------');
    console.log('Testing the original checkNFTHoldings function');
    console.log('------------------------------------------');
    try {
      console.log(`Using contract address: ${NFT_CONTRACT_ADDRESS}`);
      // Monkey patch the NFT_CONTRACT_ADDRESS if it's undefined
      if (!process.env.NFT_CONTRACT_ADDRESS) {
        process.env.NFT_CONTRACT_ADDRESS = NFT_CONTRACT_ADDRESS;
      }
      
      console.log(`Checking if wallet ${walletAddress} holds a Lil Monaliens NFT...`);
      const hasNFT = await blockVisionApi.checkNFTHoldings(walletAddress);
      console.log(`\nOriginal NFT check result: Wallet ${walletAddress} ${hasNFT ? 'HAS ✅' : 'DOES NOT HAVE ❌'} a Lil Monaliens NFT`);
    } catch (error) {
      console.error('Error testing original checkNFTHoldings function:', error);
    }
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testWalletNFT(); 