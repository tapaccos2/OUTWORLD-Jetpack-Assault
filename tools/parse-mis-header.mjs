#!/usr/bin/env node
/**
 * Parse only the known front matter of Outwars Mission Builder .MIS files.
 * This is intentionally conservative: it does not interpret object records.
 *
 * Usage:
 *   node tools/parse-mis-header.mjs original-data/misn/Anub02.mis
 */
import fs from 'node:fs';
import path from 'node:path';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node tools/parse-mis-header.mjs <file.mis> [file.mis ...]');
  process.exitCode = 2;
} else {
  const results = files.map(file => {
    const data = fs.readFileSync(file);
    let offset = 0;
    const readLengthPrefixed = () => {
      if (offset >= data.length) return null;
      const length = data[offset++];
      if (length === 0 || offset + length > data.length) return null;
      const value = data.toString('latin1', offset, offset + length);
      if ([...value].some(ch => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) > 126)) return null;
      offset += length;
      return { value, offset };
    };

    const versionField = readLengthPrefixed();
    if (!versionField) {
      return { file: path.basename(file), bytes: data.length, error: 'Unrecognized version field' };
    }

    // Current files have "Mission Builder v1.9"; Anub01 has a trailing "G"
    // byte after that field, followed directly by a NUL-terminated briefing.
    let version = versionField.value;
    let title = null;
    let legacyBriefing = null;
    const next = data[offset];

    if (next >= 32 && next <= 126) {
      let end = offset;
      while (end < data.length && data[end] !== 0) end++;
      const text = data.toString('latin1', offset, end);
      if (text.startsWith('G') && text.length > 1) {
        version += text[0];
        legacyBriefing = text.slice(1);
        offset = end + (end < data.length ? 1 : 0);
      }
    }

    if (legacyBriefing === null) {
      const titleField = readLengthPrefixed();
      if (titleField) title = titleField.value;
      else return {
        file: path.basename(file),
        bytes: data.length,
        version,
        error: 'Could not safely parse title field',
        nextOffset: offset,
      };
    }

    return {
      file: path.basename(file),
      bytes: data.length,
      version,
      title,
      legacyBriefing,
      frontMatterEndOffset: offset,
      nextBytesHex: data.subarray(offset, Math.min(offset + 32, data.length))
        .toString('hex').match(/.{1,2}/g)?.join(' ') ?? '',
    };
  });
  process.stdout.write(JSON.stringify(results, null, 2) + '\n');
}
