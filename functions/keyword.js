/**
 * PubNub Function — Keyword Order Forwarder
 *
 * Trigger : After Publish or Fire
 * Channel : user.shopping
 *
 * On each published message:
 *   1. Reads App Context metadata for the triggering channel
 *   2. Extracts custom.keyword from that metadata
 *   3. If the message text contains the keyword (case-insensitive),
 *      forwards the enriched message to the "admin.keyword-orders" channel
 */

export default async (request) => {
    const xhr    = require('xhr');
    const pubnub = require('pubnub');

    const TARGET_CHANNEL = 'admin.keyword-orders';

    // Message and channel come directly from the request object
    const message = request.message;
    const channel = request.channels[0];

    // Only process chat messages that carry a text payload
    if (!message || message.type !== 'chat' || typeof message.text !== 'string') {
        return request.ok();
    }

    // ── 1. Fetch channel metadata ────────────────────────────────
    // include=custom is required to return the custom fields object
    const metaUrl = `https://ps.pndsn.com/v2/objects/${request.subkey}/channels/${channel}?include=custom`;

    let keyword;
    try {
        const response = await xhr.fetch(metaUrl);

        if (response.status === 404) {
            // Channel object doesn't exist in App Context yet — nothing to match against
            console.log(`No App Context metadata found for channel "${channel}" — skipping.`);
            return request.ok();
        }

        if (response.status !== 200) {
            console.error(`Metadata fetch failed — HTTP ${response.status}`);
            return request.ok();
        }

        const body = JSON.parse(response.body);
        keyword = body.data &&
                  body.data.custom &&
                  body.data.custom.keyword;
    } catch (e) {
        console.error('Error fetching channel metadata:', e.message);
        return request.ok();
    }

    if (!keyword) {
        console.log(`No keyword configured for channel "${channel}" — skipping.`);
        return request.ok();
    }

    // ── 2. Check for keyword match ───────────────────────────────
    if (!message.text.toLowerCase().includes(keyword.toLowerCase())) {
        return request.ok();
    }

    console.log(`Keyword "${keyword}" matched in message from ${message.username || 'unknown'}`);

    // ── 3. Forward to keyword-orders ────────────────────────────
    try {
        await pubnub.publish({
            channel: TARGET_CHANNEL,
            message: {
                type:            'keyword_match',
                text:            message.text,
                username:        message.username || 'unknown',
                uuid:            message.uuid     || '',
                matched_keyword: keyword,
                source_channel:  channel
            }
        });
    } catch (e) {
        console.error('Error publishing to keyword-orders:', e.message);
    }

    return request.ok();
};
