export function bannedWords(): string[]
export function lintPrompt(text: string): string[]
export function lintManifest(manifest: { models: { slug: string; prompt: string }[] }): { slug: string; word: string }[]
