import type { ContactsPort, Contact } from "@/domain/ports/contacts-port";

const FAKE_CONTACTS: Contact[] = [
  { name: "Marie Dupont", phone: "06 12 34 56 78", email: "marie.dupont@example.fr" },
  { name: "Pierre Martin", phone: "07 23 45 67 89", email: "p.martin@example.fr" },
  { name: "Sophie Bernard", phone: "06 34 56 78 90", email: "sophie.bernard@example.fr" },
  { name: "Lucas Moreau", phone: "07 45 67 89 01", email: "lucas.moreau@example.fr" },
  { name: "Isabelle Petit", phone: "06 56 78 90 12", email: "i.petit@example.fr" },
  { name: "Thomas Leroy", phone: "07 67 89 01 23", email: "thomas.leroy@example.fr" },
  { name: "Camille Roux", phone: "06 78 90 12 34", email: "camille.roux@example.fr" },
  { name: "Antoine Simon", phone: "07 89 01 23 45", email: "a.simon@example.fr" },
];

// TODO: replace with a real contacts API (Google Contacts, CardDAV, etc.)
export class FakeContactsAdapter implements ContactsPort {
  async lookup(name: string): Promise<{ contact: Contact | null; message: string }> {
    const query = name.toLowerCase().trim();
    const contact = FAKE_CONTACTS.find((c) => c.name.toLowerCase().includes(query)) ?? null;

    if (contact) {
      return {
        contact,
        message: `Contact trouvé : ${contact.name}${contact.phone ? `, ${contact.phone}` : ""}${contact.email ? `, ${contact.email}` : ""}.`,
      };
    }

    return {
      contact: null,
      message: `Aucun contact trouvé pour "${name}".`,
    };
  }
}
