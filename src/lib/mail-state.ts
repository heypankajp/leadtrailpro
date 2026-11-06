/**
 * Whether a sending mailbox is chosen under Settings → Email delivery, remembered in the process so the synchronous
 * `isMailerConfigured()` can answer for the Gmail provider. Settings reads and writes keep it current.
 */
let senderChosen = false;
export const noteSenderChosen = (chosen: boolean) => { senderChosen = chosen; };
export const isSenderChosen = () => senderChosen;
