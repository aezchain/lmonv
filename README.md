# Lil Monaliens Verification Bot

A Discord bot for the Lil Monaliens community to verify Monad wallet ownership and assign roles to holders.

## Features

- **Wallet Verification**: Verify wallet ownership through on-chain transactions
- **NFT Detection**: Automatically detect Lil Monaliens NFTs in verified wallets
- **Role Management**: Assign Discord roles to verified NFT holders
- **User-Friendly Interface**: Easy-to-use Discord commands and buttons

## Setup

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- A Discord bot token
- A BlockVision API key

### Installation

1. Clone this repository
   ```bash
   git clone https://github.com/yourusername/lil-monaliens-verify.git
   cd lil-monaliens-verify
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Create a `.env` file with the following variables:
   ```
   # Discord Bot Settings
   DISCORD_TOKEN=your_discord_bot_token
   GUILD_ID=your_discord_server_id
   CLIENT_ID=your_discord_client_id
   WELCOME_CHANNEL_ID=your_welcome_channel_id
   
   # BlockVision API
   BLOCKVISION_API_KEY=your_blockvision_api_key
   
   # MongoDB (optional)
   MONGODB_URI=your_mongodb_connection_string
   
   # NFT Settings
   NFT_CONTRACT_ADDRESS=0xae280ca8dfaaf852b0af828cd72391ce7874fbb6
   
   # Role Settings
   LIL_MONALIEN_ROLE_ID=your_role_id
   ```

4. Start the bot
   ```bash
   npm start
   ```

### Deploy Discord Commands

1. To register slash commands with Discord:
   ```bash
   node deploy-commands.js
   ```

## Usage

The bot provides several commands:

- `/link-wallet` - Link a Monad wallet to your Discord account
- `/my-wallets` - View your linked wallets
- `/refresh-nft` - Refresh NFT data for your wallets
- `/remove-wallet` - Remove a linked wallet

Additionally, users can use buttons in the welcome message for quick access to these features.

## Configuration

### NFT Contract Address

Set the `NFT_CONTRACT_ADDRESS` in your `.env` file to the contract address of your NFT collection.

### Discord Role

The bot will assign the role specified by `LIL_MONALIEN_ROLE_ID` to users who own the NFT.

## License

MIT 