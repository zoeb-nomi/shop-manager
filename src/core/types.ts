// Shapes shared by every surface (SPEC "Core rule"). src/core never imports grammy or hono.

export type Surface = 'telegram' | 'web' | 'whatsapp';

export type Inbound = {
  userId: string;
  surface: Surface;
  text?: string;
  photoPath?: string;
  button?: string;
};

export type Button = { id: string; label: string };

// `edit: true` on a buttons reply means "update the message whose button was tapped" instead of sending a new one.
// Used by the multi-select question, so ticking a box does not flood the chat.
export type Reply =
  | { kind: 'text'; text: string }
  | { kind: 'image'; path: string; caption?: string }
  | { kind: 'buttons'; text: string; buttons: Button[]; edit?: boolean };
