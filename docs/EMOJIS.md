# Emoji registry

BLE Bot uses a central semantic registry. Values come from environment variables such as `BLE_EMOJI_SUCCESS` and are formatted only after syntax validation.

Use application-owned custom emojis in the form `name:snowflake` or Discord markup. Do not use guild-specific emojis or Unicode fallback symbols. Missing values produce text-only components and embeds. Run `pnpm emoji:validate` before deployment and `/developer emoji-status` after the bot is connected.
