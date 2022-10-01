import { Client, Colors, IntentsBitField, InteractionType } from "discord.js";
import fs from "fs";
import config from "./config.js";

const client = new Client({ intents: [IntentsBitField.Flags.Guilds] });

process.on("uncaughtException", (error) => console.error(error));

const commands = [];
const command_map = new Map();

for (const name of fs.readdirSync("src/commands")) {
    const { command, execute, autocomplete } = await import(
        `./commands/${name}`
    );

    commands.push(command);
    command_map.set(command.name, { execute, autocomplete });
}

client.once("ready", async () => {
    await client.application.commands.set(commands);

    console.log("TCN Autosync is ready.");
});

client.on("guildCreate", async (guild) => {
    console.log(`=> added to ${guild.name} (${guild.id})`);
});

client.on("guildDelete", async (guild) => {
    console.log(`<= removed from ${guild.name} (${guild.id})`);
});

client.on("interactionCreate", async (interaction) => {
    if (interaction.type == InteractionType.ApplicationCommand) {
        await interaction.deferReply({ ephemeral: true });

        const { execute } = command_map.get(interaction.commandName) ?? {};

        if (execute) {
            try {
                let data = await execute(interaction);
                if (data) await interaction.editReply(data);
            } catch (error) {
                await interaction.editReply({
                    embeds: [
                        {
                            title: "Error",
                            description:
                                "An error occurred executing this command.",
                            color: Colors.Red,
                        },
                    ],
                });

                throw error;
            }
        }
    } else if (
        interaction.type == InteractionType.ApplicationCommandAutocomplete
    ) {
        const { autocomplete } = command_map.get(interaction.commandName) ?? {};

        if (autocomplete) {
            let data = await autocomplete(interaction);
            if (data) {
                if (!Array.isArray(data)) data = [data];
                await interaction.respond(
                    data.map((x) => (is_string(x) ? { name: x, value: x } : x))
                );
            }
        }
    } else if (
        interaction.type == InteractionType.MessageComponent ||
        interaction.type == InteractionType.ModalSubmit
    ) {
        if (interaction.customId.startsWith(":")) {
            let cmd = interaction.customId.substring(1);
            const [id, key, ...args] = cmd.split(/:/);

            if (id && interaction.user.id != id) return;

            let handle;

            try {
                ({ default: handle } = await import(`./components/${key}.js`));
            } catch {
                return;
            }

            if (handle) await handle(interaction, ...args);
        }
    }
});

await client.login(config.discord_token);
