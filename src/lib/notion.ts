/**
 * Minimal Notion REST client.
 *
 * - Runs only on the server, so `NOTION_TOKEN` never reaches the browser.
 * - Uses `Notion-Version: 2022-06-28` (database endpoints). Databases that were
 *   migrated to the newer data-source model fall back automatically to
 *   `/data_sources/{id}` with `2025-09-03`.
 */

const API = "https://api.notion.com/v1";
const V_LEGACY = "2022-06-28";
const V_DATA_SOURCE = "2025-09-03";
const MAX_ROWS = 4000;

export interface NotionRichText {
  type?: string;
  plain_text?: string;
  href?: string | null;
  annotations?: { bold?: boolean; italic?: boolean; strikethrough?: boolean; underline?: boolean; code?: boolean };
  text?: { content?: string; link?: { url?: string } | null };
}

export interface NotionPage {
  id: string;
  url?: string;
  created_time?: string;
  last_edited_time?: string;
  archived?: boolean;
  properties: Record<string, NotionProperty>;
}

export type NotionProperty = Record<string, unknown> & { type?: string };

export interface QueryOptions {
  filter?: unknown;
  sorts?: unknown;
  pageSize?: number;
}

export class NotionError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = "notion_error") {
    super(message);
    this.name = "NotionError";
    this.status = status;
    this.code = code;
  }
}

export function notionToken(): string | null {
  const token = process.env.NOTION_TOKEN;
  return token && token.trim().length > 0 ? token.trim() : null;
}

export function hasNotionToken(): boolean {
  return notionToken() !== null;
}

const dataSourceCache = new Map<string, string>();

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function request<T>(path: string, init: RequestInit = {}, version = V_LEGACY, attempt = 0): Promise<T> {
  const token = notionToken();
  if (!token) {
    throw new NotionError("NOTION_TOKEN 이 설정되지 않았습니다.", 503, "missing_token");
  }

  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": version,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (res.status === 429 && attempt < 3) {
    const retryAfter = Number(res.headers.get("retry-after") ?? "1");
    await sleep(Math.min(5, Math.max(0.4, retryAfter)) * 1000);
    return request<T>(path, init, version, attempt + 1);
  }

  if (!res.ok) {
    let message = `Notion API ${res.status}`;
    let code = "notion_error";
    try {
      const body = (await res.json()) as { message?: string; code?: string };
      message = body.message ?? message;
      code = body.code ?? code;
    } catch {
      /* keep default message */
    }
    if (res.status === 401) message = "Notion 토큰이 올바르지 않습니다. NOTION_TOKEN 을 확인해 주세요.";
    if (res.status === 404) message = "Notion DB를 찾을 수 없습니다. 통합(Integration)에 DB가 연결되어 있는지 확인해 주세요.";
    throw new NotionError(message, res.status, code);
  }

  return (await res.json()) as T;
}

async function resolveDataSourceId(databaseId: string): Promise<string> {
  const cached = dataSourceCache.get(databaseId);
  if (cached) return cached;

  const body = await request<{ data_sources?: { id: string }[] }>(`/databases/${databaseId}`, {}, V_DATA_SOURCE);
  const id = body.data_sources?.[0]?.id;
  if (!id) {
    throw new NotionError("이 데이터베이스에서 데이터 소스를 찾지 못했습니다.", 400, "no_data_source");
  }
  dataSourceCache.set(databaseId, id);
  return id;
}

interface QueryResponse {
  results: NotionPage[];
  has_more?: boolean;
  next_cursor?: string | null;
}

export async function queryDatabase(databaseId: string, options: QueryOptions = {}): Promise<NotionPage[]> {
  const rows: NotionPage[] = [];
  let cursor: string | null | undefined = undefined;
  let useDataSource = false;

  do {
    const payload: Record<string, unknown> = {
      page_size: options.pageSize ?? 100,
      ...(options.filter ? { filter: options.filter } : {}),
      ...(options.sorts ? { sorts: options.sorts } : {}),
      ...(cursor ? { start_cursor: cursor } : {}),
    };

    let body: QueryResponse;
    if (!useDataSource) {
      try {
        body = await request<QueryResponse>(`/databases/${databaseId}/query`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } catch (error) {
        const isModelError =
          error instanceof NotionError &&
          (error.status === 400 || error.status === 404) &&
          !/token|권한|찾을 수 없습니다/.test(error.message);
        if (!isModelError) throw error;
        useDataSource = true;
        const dsId = await resolveDataSourceId(databaseId);
        body = await request<QueryResponse>(
          `/data_sources/${dsId}/query`,
          { method: "POST", body: JSON.stringify(payload) },
          V_DATA_SOURCE,
        );
      }
    } else {
      const dsId = await resolveDataSourceId(databaseId);
      body = await request<QueryResponse>(
        `/data_sources/${dsId}/query`,
        { method: "POST", body: JSON.stringify(payload) },
        V_DATA_SOURCE,
      );
    }

    rows.push(...(body.results ?? []));
    cursor = body.has_more ? body.next_cursor : null;
  } while (cursor && rows.length < MAX_ROWS);

  return rows;
}

export async function createPage(
  databaseId: string,
  properties: Record<string, unknown>,
): Promise<NotionPage> {
  const payload = { parent: { database_id: databaseId }, properties };
  try {
    return await request<NotionPage>("/pages", { method: "POST", body: JSON.stringify(payload) });
  } catch (error) {
    if (!(error instanceof NotionError) || error.status !== 400) throw error;
    const dsId = await resolveDataSourceId(databaseId);
    return request<NotionPage>(
      "/pages",
      { method: "POST", body: JSON.stringify({ parent: { data_source_id: dsId, database_id: databaseId }, properties }) },
      V_DATA_SOURCE,
    );
  }
}

export async function updatePage(
  pageId: string,
  properties: Record<string, unknown>,
): Promise<NotionPage> {
  return request<NotionPage>(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  });
}

/** B3: reads one page (last_edited_time + property values) before a write. */
export async function retrievePage(pageId: string): Promise<NotionPage> {
  return request<NotionPage>(`/pages/${pageId}`);
}

/** B2: the live property schema of one database, for properties added after setup. */
export interface DatabaseSchemaProperty {
  name: string;
  type: string;
  options?: string[];
}

export async function retrieveDatabaseSchema(databaseId: string): Promise<DatabaseSchemaProperty[]> {
  const read = async (version: string, path: string) =>
    request<{ properties?: Record<string, { type?: string; select?: { options?: { name?: string }[] }; status?: { options?: { name?: string }[] }; multi_select?: { options?: { name?: string }[] } }> }>(
      path,
      {},
      version,
    );
  let body: Awaited<ReturnType<typeof read>>;
  try {
    body = await read(V_LEGACY, `/databases/${databaseId}`);
  } catch (error) {
    if (!(error instanceof NotionError)) throw error;
    const dsId = await resolveDataSourceId(databaseId);
    body = await read(V_DATA_SOURCE, `/data_sources/${dsId}`);
  }
  const properties = body.properties ?? {};
  return Object.entries(properties).map(([name, value]) => {
    const options =
      value.select?.options ?? value.status?.options ?? value.multi_select?.options ?? undefined;
    return {
      name,
      type: value.type ?? "other",
      ...(options ? { options: options.map((option) => option.name ?? "").filter(Boolean) } : {}),
    };
  });
}

export async function archivePage(pageId: string): Promise<void> {
  try {
    await request(`/pages/${pageId}`, {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
    });
  } catch (error) {
    if (!(error instanceof NotionError) || error.status !== 400) throw error;
    await request(`/pages/${pageId}`, {
      method: "PATCH",
      body: JSON.stringify({ in_trash: true }),
    });
  }
}

export interface DatabaseProbe {
  ok: boolean;
  message: string;
}

/* ─────────────────────── A5: page body (blocks) ─────────────────────── */

export interface NotionBlock {
  id: string;
  type: string;
  has_children?: boolean;
  archived?: boolean;
  paragraph?: { rich_text?: NotionRichText[] };
  [key: string]: unknown;
}

function blockPlainText(block: NotionBlock): string {
  const items = block.paragraph?.rich_text ?? [];
  return items.map((item) => item.plain_text ?? item.text?.content ?? "").join("");
}

function paragraphBlock(text: string): Record<string, unknown> {
  const items: Record<string, unknown>[] = [];
  for (let i = 0; i < Math.max(text.length, 1); i += 1900) {
    items.push({ type: "text", text: { content: text.slice(i, i + 1900) } });
  }
  return { object: "block", type: "paragraph", paragraph: { rich_text: items } };
}

/** Every direct child block of a page, following `has_more`. */
export async function listBlockChildren(blockId: string): Promise<NotionBlock[]> {
  const blocks: NotionBlock[] = [];
  let cursor: string | null = null;
  do {
    const query: string = new URLSearchParams({ page_size: "100", ...(cursor ? { start_cursor: cursor } : {}) }).toString();
    const body: { results?: NotionBlock[]; has_more?: boolean; next_cursor?: string | null } = await request(
      `/blocks/${blockId}/children?${query}`,
    );
    blocks.push(...(body.results ?? []));
    cursor = body.has_more ? body.next_cursor ?? null : null;
  } while (cursor);
  return blocks;
}

async function deleteBlock(blockId: string): Promise<void> {
  await request(`/blocks/${blockId}`, { method: "DELETE" });
}

async function appendBlocks(pageId: string, children: Record<string, unknown>[]): Promise<void> {
  for (let i = 0; i < children.length; i += 50) {
    await request(`/blocks/${pageId}/children`, {
      method: "PATCH",
      body: JSON.stringify({ children: children.slice(i, i + 50) }),
    });
  }
}

export interface PageBody {
  /** Editable text: paragraph blocks joined with newlines. */
  text: string;
  /** Block types that stay untouched (toggles, lists, headings, …). */
  preserved: string[];
  paragraphCount: number;
}

/**
 * Reads a page body. Only top-level `paragraph` blocks are editable text; every
 * other block (toggle, list, heading, image …) is left untouched by a write.
 */
export async function readPageBody(pageId: string): Promise<PageBody> {
  const blocks = await listBlockChildren(pageId);
  const paragraphs = blocks.filter((block) => block.type === "paragraph" && !block.archived);
  const preserved = [...new Set(blocks.filter((block) => block.type !== "paragraph").map((block) => block.type))];
  const text = paragraphs.map(blockPlainText).join("\n").replace(/\n+$/, "");
  return { text, preserved, paragraphCount: paragraphs.length };
}

/**
 * Replaces the editable paragraphs of a page body.
 *
 * Safe by design: existing paragraph blocks are deleted one by one and the new text
 * is appended as paragraphs; blocks of every other type are never touched, so a
 * toggle or list inside the page keeps its children and formatting. If the write
 * fails halfway, the already-added paragraphs remain, so the result is still readable.
 */
export async function replacePageBody(pageId: string, text: string): Promise<PageBody> {
  const before = await readPageBody(pageId);
  const blocks = await listBlockChildren(pageId);
  for (const block of blocks) {
    if (block.type !== "paragraph" || block.archived) continue;
    await deleteBlock(block.id);
  }
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === "") lines.pop();
  if (lines.length > 0) await appendBlocks(pageId, lines.map(paragraphBlock));
  return { text: lines.join("\n"), preserved: before.preserved, paragraphCount: lines.length };
}

/**
 * Lightweight connection check for one database (metadata only, no rows).
 * Used by `/api/status` so the UI can tell which of the five DBs are wired.
 */
export async function probeDatabase(databaseId: string): Promise<DatabaseProbe> {
  if (!databaseId.trim()) return { ok: false, message: "DB ID가 비어 있어 연결되지 않았습니다." };
  try {
    await request(`/databases/${databaseId}`, {}, V_LEGACY);
    return { ok: true, message: "연결됨" };
  } catch (error) {
    // Databases migrated to the data-source model answer 400 on the legacy endpoint.
    if (error instanceof NotionError && error.status === 400) {
      try {
        await request(`/databases/${databaseId}`, {}, V_DATA_SOURCE);
        return { ok: true, message: "연결됨" };
      } catch (fallback) {
        return { ok: false, message: messageOf(fallback) };
      }
    }
    return { ok: false, message: messageOf(error) };
  }
}

function messageOf(error: unknown): string {
  if (error instanceof NotionError) return error.message;
  return "Notion 연결을 확인하지 못했습니다.";
}

export function isNotionPageId(value: string): boolean {
  return /^[0-9a-f]{32}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
