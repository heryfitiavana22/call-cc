export interface Contact {
  name: string;
  phone?: string;
  email?: string;
}

export interface IContacts {
  lookup(name: string): Promise<{ contact: Contact | null; message: string }>;
}
