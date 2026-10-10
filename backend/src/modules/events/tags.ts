export function parseTags(tagsField: string | string[] | null | undefined): string[] {
  if (!tagsField) return [];
  if (Array.isArray(tagsField)) return tagsField;
  try {
    const parsed = JSON.parse(tagsField);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return tagsField.split(',').map((t) => t.trim()).filter(Boolean);
  }
}

export function serializeTags(tags: string[]): string {
  return JSON.stringify(Array.from(new Set(tags.map((t) => t.trim().toLowerCase()))));
}
