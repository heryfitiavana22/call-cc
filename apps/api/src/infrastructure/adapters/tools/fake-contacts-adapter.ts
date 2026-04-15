import type { IContacts } from "@/domain/ports/i-contacts";

// TODO: replace with a real contacts API (Google Contacts, CardDAV, etc.)
export class FakeContactsAdapter implements IContacts {
  async lookup(name: string): Promise<{ contact: null; message: string }> {
    return {
      contact: null,
      message: `Contact "${name}" non trouvé. (simulation)`,
    };
  }
}
