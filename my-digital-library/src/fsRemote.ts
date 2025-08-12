// src/fsRemote.ts
import type { BookMetadata } from "./types";

export type RemoteBook = {
  id: string;
  folderName: string;
  fileName: string;
  format: "pdf" | "epub" | "audio";
  itemType?: string;
  metadata?: BookMetadata;
};

const ok = async (res: Response) => {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res;
};

export const RemoteFS = {
  // ------- books -------
  listBooks: async (): Promise<RemoteBook[]> =>
    (await ok(await fetch("/api/books"))).json(),

  getMetadata: async (id: string) =>
    (
      await ok(await fetch(`/api/books/${encodeURIComponent(id)}/metadata`))
    ).json(),

  saveMetadata: async (id: string, data: any) =>
    (
      await ok(
        await fetch(`/api/books/${encodeURIComponent(id)}/metadata`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        })
      )
    ).json(),

  getNotes: async (id: string) =>
    (
      await ok(await fetch(`/api/books/${encodeURIComponent(id)}/notes`))
    ).json(),

  saveNotes: async (id: string, data: any) =>
    (
      await ok(
        await fetch(`/api/books/${encodeURIComponent(id)}/notes`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        })
      )
    ).json(),

  deleteBook: async (id: string) =>
    (
      await ok(
        await fetch(`/api/books/${encodeURIComponent(id)}`, {
          method: "DELETE",
        })
      )
    ).json(),

  fileUrl: (book: { folderName: string; fileName: string }) =>
    `/files/${encodeURIComponent(book.folderName)}/${encodeURIComponent(
      book.fileName
    )}`,

  uploadBook: async (
    file: File,
    metadata: Partial<BookMetadata>,
    opts?: { mode?: "auto-number" | "overwrite" | "fail"; coverFile?: File }
  ) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("metadata", JSON.stringify(metadata || {}));
    if (opts?.coverFile) fd.append("cover", opts.coverFile);
    const q = new URLSearchParams();
    if (opts?.mode) q.set("mode", opts.mode);
    const res = await ok(
      await fetch(`/api/books?${q.toString()}`, { method: "POST", body: fd })
    );
    return res.json() as Promise<{ ok: true; book: RemoteBook }>;
  },

  replacePrimaryFile: async (id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return (
      await ok(
        await fetch(`/api/books/${encodeURIComponent(id)}/file`, {
          method: "PUT",
          body: fd,
        })
      )
    ).json();
  },

  uploadCover: async (id: string, coverFile: File) => {
    const fd = new FormData();
    fd.append("cover", coverFile);
    return (
      await ok(
        await fetch(`/api/books/${encodeURIComponent(id)}/cover`, {
          method: "PUT",
          body: fd,
        })
      )
    ).json();
  },

  renameBook: async (id: string, newName: string) =>
    (
      await ok(
        await fetch(`/api/books/${encodeURIComponent(id)}/rename`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newName }),
        })
      )
    ).json(),

  // ------- collections -------
  getCollections: async (): Promise<Collection[]> =>
    (await ok(await fetch("/api/collections"))).json(),

  saveCollections: async (collections: Collection[]) =>
    (
      await ok(
        await fetch("/api/collections", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collections }),
        })
      )
    ).json(),
};

// Re-export Collection type for convenience
export type Collection = {
  id: string;
  name: string;
  parentId?: string;
  bookIds: string[];
  createdAt: string;
  updatedAt: string;
};
