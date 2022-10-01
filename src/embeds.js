import { Colors } from "discord.js";

export function embed(embed) {
    return { embeds: [embed] };
}

export function template(message, title, color) {
    return embed({ title, description: message, color });
}

export function success(message) {
    return template(message, "Success", Colors.Green);
}

export function fail(message) {
    return template(message, "Error", Colors.Red);
}
