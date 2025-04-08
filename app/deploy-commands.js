require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Only include admin commands 
// Public commands will only be accessible via the welcome panel buttons
for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  
  // Only deploy admin commands (dbStatus)
  if ('data' in command && command.data.name === 'db-status') {
    commands.push(command.data.toJSON());
    console.log(`Including admin command: ${command.data.name}`);
  } else {
    console.log(`Skipping public command: ${command.data?.name || file}`);
  }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

// Deploy commands
(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);
    
    // The put method is used to fully refresh all commands with the current set
    const data = await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID, 
        process.env.GUILD_ID
      ),
      { body: commands },
    );
    
    console.log(`Successfully reloaded ${data.length} application (/) commands.`);
  } catch (error) {
    console.error(error);
  }
})(); 