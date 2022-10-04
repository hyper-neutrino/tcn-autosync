import {
    ApplicationCommandOptionType,
    ApplicationCommandType,
    ButtonStyle,
    ComponentType,
    escapeBold,
    escapeMarkdown,
    parseWebhookURL,
} from "discord.js";
import fetch from "node-fetch";
import api from "../api.js";
import config from "../config.js";
import db from "../db.js";
import { embed, fail, success, template } from "../embeds.js";

export const command = {
    type: ApplicationCommandType.ChatInput,
    name: "autosync",
    description: "manage the TCN partner embed autosync",
    dm_permission: false,
    default_member_permissions: "0",
    options: [
        {
            type: ApplicationCommandOptionType.Subcommand,
            name: "clear",
            description: "clear out all stored data for this server",
        },
        {
            type: ApplicationCommandOptionType.SubcommandGroup,
            name: "webhook",
            description:
                "set the TCN partner embed autosync webhook for this server",
            options: [
                {
                    type: ApplicationCommandOptionType.Subcommand,
                    name: "set",
                    description: "set the webhook by URL",
                    options: [
                        {
                            type: ApplicationCommandOptionType.String,
                            name: "webhook",
                            description: "the webhook URL",
                            required: true,
                        },
                    ],
                },
            ],
        },
        {
            type: ApplicationCommandOptionType.SubcommandGroup,
            name: "message",
            description:
                "set the TCN partner embed autosync target message for this server",
            options: [
                {
                    type: ApplicationCommandOptionType.Subcommand,
                    name: "set",
                    description: "set the message by URL",
                    options: [
                        {
                            type: ApplicationCommandOptionType.String,
                            name: "message",
                            description: "the message URL",
                            required: true,
                        },
                    ],
                },
            ],
        },
        {
            type: ApplicationCommandOptionType.SubcommandGroup,
            name: "mode",
            description:
                "toggle between editing and reposting when autosyncing",
            options: [
                {
                    type: ApplicationCommandOptionType.Subcommand,
                    name: "edit",
                    description:
                        "when autosyncing, edit the target message if possible",
                },
                {
                    type: ApplicationCommandOptionType.Subcommand,
                    name: "repost",
                    description:
                        "when autosyncing, post a new message and delete the old target if possible",
                },
            ],
        },
        {
            type: ApplicationCommandOptionType.Subcommand,
            name: "help",
            description: "view a command list and bot help",
        },
        {
            type: ApplicationCommandOptionType.Subcommand,
            name: "push",
            description:
                "push a new embed to all connected locations (observer only)",
            options: [
                {
                    type: ApplicationCommandOptionType.Attachment,
                    name: "json",
                    description: "the message json",
                    required: true,
                },
            ],
        },
        {
            type: ApplicationCommandOptionType.Subcommand,
            name: "update",
            description: "update this server's embed",
        },
    ],
};

export async function execute(cmd) {
    const subgroup = cmd.options.getSubcommandGroup();
    const sub = cmd.options.getSubcommand();

    if (
        sub != "clear" &&
        sub != "push" &&
        cmd.guild.id != "878812623725002752"
    ) {
        try {
            await api(`/guilds/${cmd.guild.id}`);
        } catch {
            return fail("This is not a TCN server.");
        }
    }

    if (sub == "clear") {
        await db("guilds").findOneAndDelete({ guild: cmd.guild.id });
        console.log(`[${cmd.guild.id}] ${cmd.guild.name} cleared its data`);
        return success("Cleared your server's stored data!");
    } else if (subgroup == "webhook") {
        if (sub == "set") {
            const options = parseWebhookURL(cmd.options.getString("webhook"));

            if (!options) {
                return fail("That does not appear to be a valid webhook URL.");
            }

            let webhook;

            try {
                webhook = await cmd.client.fetchWebhook(
                    options.id,
                    options.token
                );
            } catch {
                cmd.client.rest.setToken(config.discord_token);

                return fail(
                    "That webhook does not exist, or the token is invalid (make sure you copy-pasted correctly)."
                );
            }

            if (webhook.guildId != cmd.guild.id) {
                let guild;

                try {
                    guild = await cmd.client.guilds.fetch(webhook.guildId);
                } catch {}

                return fail(
                    `That webhook is not from this server${
                        guild
                            ? ` (you appear to have provided a webhook from **${escapeMarkdown(
                                  guild.name
                              )}**)`
                            : ""
                    }!`
                );
            }

            await db("guilds").findOneAndUpdate(
                { guild: cmd.guild.id },
                { $set: { id: options.id, token: options.token } },
                { upsert: true }
            );

            console.log(`[${cmd.guild.id}] ${cmd.guild.name} set its webhook`);

            return success(
                `Your server's TCN partner webhook has been set to the webhook named **${escapeBold(
                    webhook.name
                )}**!`
            );
        }
    } else if (subgroup == "message") {
        if (sub == "set") {
            const match = cmd.options
                .getString("message")
                .match(
                    /https:\/\/(canary\.|ptb\.)?discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/
                );

            if (!match) {
                return fail("That does not appear to be a valid message URL.");
            }

            if (match[2] != cmd.guild.id) {
                return fail(
                    "That message link does not belong to the correct server."
                );
            }

            let message;

            try {
                const channel = await cmd.guild.channels.fetch(match[3]);
                message = await channel.messages.fetch(match[4]);
            } catch {
                return fail(
                    "That message link points to a message that does not exist or that the bot does not have permission to view."
                );
            }

            await db("guilds").findOneAndUpdate(
                { guild: cmd.guild.id },
                { $set: { message: message.id } },
                { upsert: true }
            );

            console.log(
                `[${cmd.guild.id}] ${cmd.guild.name} set its message link`
            );

            return success(
                `Your server's embed message has been set to [this message](${message.url})!`
            );
        }
    } else if (subgroup == "mode") {
        await db("guilds").findOneAndUpdate(
            { guild: cmd.guild.id },
            { $set: { mode: sub } },
            { upsert: true }
        );

        console.log(
            `[${cmd.guild.id}] ${cmd.guild.name} switched to ${sub} mode`
        );

        return success(
            {
                edit: "The bot will edit the target message if possible and post it otherwise.",
                repost: "The bot will delete the target message if possible and post it whether or not that succeeded.",
            }[sub]
        );
    } else if (sub == "help") {
        const f = (x) => `</${x}:${cmd.command.id}>`;

        return embed({
            title: "**TCN Autosync System**",
            description: `Full guide available [here](https://docs.google.com/document/d/1CZqaV4HAiNDgv7aTNS8MNdEMgDoIaihv-ymeI18ar64).\n\n1. Use ${f(
                "autosync webhook set"
            )} with your desired webhook URL.\n2. Use ${f(
                "autosync message set"
            )} with the message link to the current partner embed (optional).\n3. If you would like the message to be deleted and reposted each time instead of edited, use ${f(
                "autosync mode repost"
            )}. To revert to editing, use ${f(
                "autosync mode edit"
            )}.\n\nIf you want to discontinue this service, use ${f(
                "autosync clear"
            )}. You may also just kick the bot to stop it, but if you invite it back, it will resume.`,
            color: 0x2d3136,
            footer: {
                text: "Tip: You can click on the highlighted commands to put them into your chat bar.",
            },
        });
    } else if (sub == "push") {
        const api_user = await api(`/users/${cmd.user.id}`);

        if (!api_user.roles.includes("observer")) {
            return fail("You must be an observer to use this command.");
        }

        try {
            const file = await fetch(cmd.options.getAttachment("json").url);

            if (!file.ok) throw 0;

            const json = await file.json();

            await cmd.editReply(json);

            const message = await cmd.followUp({
                embeds: [
                    {
                        title: "Confirm",
                        description:
                            "Please confirm if you would like to push the above message to all connected instances (you have 15 minutes).",
                        color: 0x2d3136,
                    },
                ],
                components: [
                    {
                        type: ComponentType.ActionRow,
                        components: [
                            {
                                type: ComponentType.Button,
                                customId: "confirm",
                                style: ButtonStyle.Secondary,
                                emoji: "⬆️",
                                label: "PUSH",
                            },
                        ],
                    },
                ],
                ephemeral: true,
                fetchReply: true,
            });

            let button;

            try {
                button = await message.awaitMessageComponent({
                    time: 15000,
                });
            } catch {
                return;
            }

            await db("message").findOneAndUpdate(
                { id: "-" },
                { $set: { data: JSON.stringify(json) } },
                { upsert: true }
            );

            await button.reply({
                ...template("Updating messages...", "Updating...", 0x2d3136),
                ephemeral: true,
            });

            console.log(`====== [ PUSH ] ======`);
            console.log(`Initiated by: ${cmd.user.tag} (${cmd.user.id})`);
            console.log(``);

            const allowed = new Set(
                (await api("/guilds")).map((guild) => guild.id)
            );

            allowed.add("878812623725002752"); // Hub

            for (const guild of await db("guilds").find({}).toArray()) {
                try {
                    await push(cmd.client, guild, json, allowed);
                } catch {}
            }

            console.log("DONE " + "-".repeat(40));

            await button.editReply(success("Pushed!"));
        } catch {
            return fail(
                "An error occurred; please make sure your file is a valid Discord message."
            );
        }
    } else if (sub == "update") {
        const guild = await db("guilds").findOne({ guild: cmd.guild.id });
        return await push(cmd.client, guild ?? { guild: cmd.guild.id });
    }
}

async function push(client, guild, message, guilds) {
    if (!message) {
        message = JSON.parse((await db("message").findOne({ id: "-" })).data);
    }

    const log = (x) => console.log(`[${guild.guild}] ${status}`);

    let status;
    let webhook;

    let blocked = false;

    if (guilds) {
        blocked = !guilds.has(guild.guild);
    } else if (guild.guild != "878812623725002752") {
        try {
            await api(`/guilds/${guild.guild}`);
        } catch {
            blocked = true;
        }
    }

    if (blocked) {
        log("not a TCN server");
        return fail("This is not a TCN server. Your command was ignored.");
    } else if (!client.guilds.cache.has(guild.guild)) {
        log("bot not in server, skipped");
        return fail("???");
    } else if (!guild.id || !guild.token) {
        log("missing webhook data, skipped");
        return fail(
            "Please set up the webhook data first (**/autosync help** for a list of commands)."
        );
    } else {
        try {
            webhook = await client.fetchWebhook(guild.id, guild.token);

            log("fetched; updating");
        } catch {
            client.rest.setToken(config.discord_token);
            log("invalid webhook, skipped and deleted records");

            try {
                await db("guilds").findOneAndUpdate(
                    { guild: guild.guild },
                    { $delete: { id: 0, token: 0 } }
                );
            } catch {}

            return fail(
                "The stored webhook data was invalid and was deleted. Please set it up again (**/autosync help** for a list of commands)."
            );
        }
    }

    if (!webhook) return fail("Webhook missing!");

    if (guild.message) {
        if (guild.mode == "repost") {
            try {
                await webhook.deleteMessage(guild.message);
                log("deleted, preparing to repost");
            } catch {
                log("failed to delete, preparing to post anyway");
            }
        } else {
            try {
                await webhook.editMessage(guild.message, json);
                log("edited");
                return success("The embed message was edited.");
            } catch {
                log("failed to edit, preparing to post normally");
            }
        }
    }

    try {
        const message = await webhook.send(json);

        try {
            await db("guilds").findOneAndUpdate(
                { guild: guild.guild },
                { $set: { message: message.id } }
            );
        } catch {}

        log("posted!");
        return success("A new embed message was posted.");
    } catch (error) {
        log("!!! ERROR IN POST");
        log(error);
        log("-".repeat(20));
        return fail(
            "An unexpected error occured in the post. Please contact HyperNeutrino#1759 if this persists."
        );
    }
}
