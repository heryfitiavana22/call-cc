export interface Contact {
  name: string;
  phone?: string;
  email?: string;
}

export interface ContactsPort {
  lookup(name: string): Promise<{ contact: Contact | null; message: string }>;
}
