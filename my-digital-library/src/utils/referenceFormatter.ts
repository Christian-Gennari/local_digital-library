import { BookMetadata, StructuredCreator, CreatorRole } from "../types";

export class ReferenceFormatter {
  static formatSurnameInitials(c: StructuredCreator): string {
    const { firstName, lastName, fullName } = c;
    if (lastName && firstName) {
      const parts = firstName.split(" ").map((part) =>
        part
          .split("-")
          .filter(Boolean)
          .map((sub) => `${sub.charAt(0).toUpperCase()}.`)
          .join("-")
      );
      const initials = parts.join(" ");
      return `${lastName}, ${initials}`.trim();
    }
    if (lastName) return lastName;
    return fullName;
  }

  static joinCreators(
    creators: StructuredCreator[],
    style: "apa" | "mla" | "chicago" | "harvard"
  ): string {
    if (!creators || creators.length === 0) return "";

    switch (style) {
      case "apa": {
        const formatted = creators.map((c) => this.formatSurnameInitials(c));
        if (formatted.length === 1) return formatted[0];
        if (formatted.length === 2) return formatted.join(" & ");
        if (formatted.length <= 20)
          return (
            formatted.slice(0, -1).join(", ") +
            ", & " +
            formatted.slice(-1)
          );
        return (
          formatted.slice(0, 19).join(", ") +
          ", ... " +
          formatted[formatted.length - 1]
        );
      }
      case "mla": {
        const first = creators[0];
        const firstFormatted = first.firstName && first.lastName
          ? `${first.lastName}, ${first.firstName}`
          : first.fullName;
        if (creators.length === 1) return firstFormatted;
        if (creators.length === 2) {
          const second = creators[1];
          const secondFormatted = second.firstName && second.lastName
            ? `${second.firstName} ${second.lastName}`
            : second.fullName;
          return `${firstFormatted}, and ${secondFormatted}`;
        }
        return `${firstFormatted}, et al.`;
      }
      case "chicago": {
        const formatted = creators.map((c, idx) => {
          if (idx === 0) {
            return c.firstName && c.lastName
              ? `${c.lastName}, ${c.firstName}`
              : c.fullName;
          }
          return c.firstName && c.lastName
            ? `${c.firstName} ${c.lastName}`
            : c.fullName;
        });
        if (formatted.length > 10) {
          return formatted.slice(0, 7).join(", ") + ", et al.";
        }
        if (formatted.length === 1) return formatted[0];
        if (formatted.length === 2) return formatted.join(" and ");
        return (
          formatted.slice(0, -1).join(", ") +
          ", and " +
          formatted.slice(-1)
        );
      }
      case "harvard": {
        const formatted = creators.map((c) => this.formatSurnameInitials(c));
        if (formatted.length === 1) return formatted[0];
        if (formatted.length === 2) return `${formatted[0]} and ${formatted[1]}`;
        if (formatted.length === 3)
          return `${formatted[0]}, ${formatted[1]} and ${formatted[2]}`;
        return `${formatted[0]} et al.`;
      }
      default:
        return "";
    }
  }

  static getCreators(
    metadata: BookMetadata,
    role: keyof NonNullable<BookMetadata["creators"]> | "authors"
  ): StructuredCreator[] {
    const structured = metadata.creators?.[
      role as keyof NonNullable<BookMetadata["creators"]>
    ];
    if (structured && structured.length) return structured;

    let legacy: string | undefined;
    if (role === "authors") legacy = metadata.author;
    else if (role === "editors") legacy = metadata.editors;
    else if (role === "translators") legacy = metadata.translators;

    if (!legacy) return [];

    return legacy
      .split(/,\s*/)
      .map((name) => {
        const trimmed = name.trim();
        if (!trimmed) return null;
        const parts = trimmed.split(/\s+/);
        if (parts.length === 1) {
          return {
            firstName: "",
            lastName: "",
            fullName: trimmed,
            role: (role.slice(0, -1) as CreatorRole) || "contributor",
          };
        }
        const lastName = parts.pop() as string;
        const firstName = parts.join(" ");
        return {
          firstName,
          lastName,
          fullName: trimmed,
          role: (role.slice(0, -1) as CreatorRole) || "contributor",
        };
      })
      .filter((c): c is StructuredCreator => c !== null);
  }
}
