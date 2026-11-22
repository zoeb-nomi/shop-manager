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

export type Reply =
  | { kind: 'text'; text: string }
  | { kind: 'image'; path: string; caption?: string }
  | { kind: 'buttons'; text: string; buttons: Button[] };
