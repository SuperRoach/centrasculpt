/** Preserve readable layer names while removing filesystem/path syntax. */
export function exportFilename(name: string, format: "stl" | "glb"): string {
  const stem =
    name
      .normalize("NFC")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: Windows filename sanitization strips control characters.
      .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "-")
      .replace(/[. ]+$/g, "")
      .trim()
      .slice(0, 120)
      .replace(/\.(stl|glb)$/i, "") || "sculpt";
  return `${/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem) ? "_" + stem : stem}.${format}`;
}
