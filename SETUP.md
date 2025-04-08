# Lil Monaliens Verify Bot Setup

This document provides detailed instructions on how to set up and run the Lil Monaliens Verify Discord bot.

## Prerequisites

1. Node.js (v16.9.0 or higher)
2. MongoDB database
3. Discord Bot Token
4. A Discord server with admin permissions

## Setup Steps

### 1. Discord Bot Creation

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to the "Bot" tab and click "Add Bot"
4. Under Privileged Gateway Intents, enable:
   - Server Members Intent
   - Message Content Intent
5. Save changes
6. Under "OAuth2" > "URL Generator":
   - Select "bot" and "applications.commands" scopes
   - Select permissions: "Manage Roles", "Send Messages", "Read Messages/View Channels"
   - Copy the generated URL and use it to invite the bot to your server

### 2. Environment Configuration

1. Copy your Bot Token from the Bot tab in the Discord Developer Portal
2. Get your Guild ID (Server ID) by enabling Developer Mode in Discord settings, then right-clicking on your server and selecting "Copy ID"
3. Get your Client ID from the "OAuth2" tab in the Discord Developer Portal
4. Create a role in your Discord server called "Lil Monalien" and copy its ID
5. Update the `.env` file with all these values:

```
DISCORD_TOKEN=your_discord_bot_token_here
GUILD_ID=your_discord_server_id_here
CLIENT_ID=your_discord_bot_client_id_here
BLOCKVISION_API_KEY=2vP90ciVJ9YOJPnSDQd3MEj1yr1
MONGODB_URI=your_mongodb_uri_here
NFT_CONTRACT_ADDRESS=0xae280ca8dfaaf852b0af828cd72391ce7874fbb6
LIL_MONALIEN_ROLE_ID=your_role_id_here
```

### 3. MongoDB Setup

1. Create a MongoDB database (you can use [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) for a free cloud database)
2. Get your MongoDB connection string and add it to the `.env` file

### 4. Installation and Running

1. Install dependencies:
   ```
   npm install
   ```

2. Register Discord commands:
   ```
   npm run deploy-commands
   ```

3. Start the bot:
   ```
   npm start
   ```

## Bot Commands

The bot provides the following commands:

- `/link-wallet` - Start the wallet verification process
- `/my-wallets` - Show all linked wallets
- `/refresh-nft` - Recheck NFT holdings and update roles
- `/remove-wallet` - Remove a linked wallet

## Verification Process

1. User executes `/link-wallet` command
2. They enter their Monad wallet address
3. The bot generates a random $MON amount (between 0.001 and 0.002)
4. User must send exactly that amount to themselves (self-transfer)
5. The bot checks for this transaction every 20 seconds
6. Once verified, the bot checks if the wallet holds any Lil Monalien NFTs
7. If NFTs are found, the "Lil Monalien" role is assigned

## Testing

You can test various components separately:

- Test random amount generation: `npm run test-random`
- Test BlockVision API: `npm run test-api` (update the test wallet address in `app/utils/testBlockVisionApi.js`)

## Troubleshooting

- If commands aren't working, make sure you've run `npm run deploy-commands`
- Check the bot's permissions in your Discord server
- Ensure the bot role is above the "Lil Monalien" role in your server settings
- Check MongoDB connection issues by looking at the console output
- Verify API key and contract address are correct

## Rate Limiting

The BlockVision API has a rate limit of ~2 queries per second. The bot includes rate limiting to stay within these constraints. 