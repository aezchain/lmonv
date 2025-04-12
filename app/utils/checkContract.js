require('dotenv').config();
const fetch = require('node-fetch');

const API_KEY = process.env.BLOCKVISION_API_KEY || '2vPWlUoscxTlEDZ6OpaLbfsLhPc';
const NFT_CONTRACT_ADDRESS = process.env.NFT_CONTRACT_ADDRESS || '0xae280ca8dfaaf852b0af828cd72391ce7874fbb6';

console.log('Checking contract information for Lil Monaliens NFT');
console.log('Contract address:', NFT_CONTRACT_ADDRESS);

async function checkContract() {
  const options = {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'x-api-key': API_KEY
    }
  };

  // Check if contract exists using contract metadata endpoint
  try {
    console.log('\nChecking contract metadata...');
    const response = await fetch(
      `https://api.blockvision.org/v2/monad/contract/${NFT_CONTRACT_ADDRESS}`,
      options
    );
    
    if (!response.ok) {
      console.error(`Contract metadata API error: ${response.status} ${response.statusText}`);
    } else {
      const data = await response.json();
      console.log('Contract data:', JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('Error checking contract metadata:', error);
  }
  
  // Check NFT collections for this contract
  try {
    console.log('\nChecking NFT collections for this contract...');
    const response = await fetch(
      `https://api.blockvision.org/v2/monad/nft/collections?pageIndex=1&pageSize=10&contractAddress=${NFT_CONTRACT_ADDRESS}`,
      options
    );
    
    if (!response.ok) {
      console.error(`NFT collections API error: ${response.status} ${response.statusText}`);
    } else {
      const data = await response.json();
      console.log('NFT collections data:', JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('Error checking NFT collections:', error);
  }
  
  // Check token metadata
  try {
    console.log('\nChecking token metadata...');
    const response = await fetch(
      `https://api.blockvision.org/v2/monad/token/${NFT_CONTRACT_ADDRESS}`,
      options
    );
    
    if (!response.ok) {
      console.error(`Token metadata API error: ${response.status} ${response.statusText}`);
    } else {
      const data = await response.json();
      console.log('Token metadata:', JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('Error checking token metadata:', error);
  }
}

checkContract(); 