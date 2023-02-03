import { ApplicationCommandType, escapeBold } from "discord.js";
import db from "../db.js";
import { fail, success } from "../embeds.js";

export const command = {
    type: ApplicationCommandType.Message,
    name: "Set Target",
    dm_permission: false,
    default_member_permissions: "0",
};

export async function execute(cmd) {
    if (!cmd.targetMessage.webhookId)
        return fail("You must select a webhook message.");

    let webhooks;

    try {
        webhooks = await cmd.channel.fetchWebhooks();
    } catch {
        return fail("Failed to fetch webhooks. To use this option, you must grant the bot the Manage Webhooks permission, at least in this channel.");
    }

    const webhook = webhooks.find((hook) => hook.id === cmd.targetMessage.webhookId);

    if (!webhook)
        return fail(
            "The webhook for that message could not be found. Perhaps it has been deleted?"
        );

    await db("guilds").findOneAndUpdate(
        { guild: cmd.guild.id },
        {
            $set: {
                id: webhook.id,
                token: webhook.token,
                message: cmd.targetMessage.id,
            },
        },
        { upsert: true }
    );

    return success(`Your server's TCN partner webhook has been set to the webhook named **${escapeBold(webhook.name)}** targeting [this message](${cmd.targetMessage.url})!`);
}
