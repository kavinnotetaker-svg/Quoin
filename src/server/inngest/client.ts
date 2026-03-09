import { Inngest } from "inngest";

/**
 * Configure the Inngest client for the Quoin platform.
 * Providing a specific event key isn't required for local dev but
 * is useful for robust typing.
 */
export const inngest = new Inngest({
    id: "quoin-beps",
    name: "Quoin BEPS Intelligence",
});
