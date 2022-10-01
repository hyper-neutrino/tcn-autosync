import fetch from "node-fetch";

export default async function (route) {
    const response = await fetch(
        `https://api.teyvatcollective.network${route}`
    );

    if (!response.ok) throw `API request failed with code ${response.status}`;

    return await response.json();
}
