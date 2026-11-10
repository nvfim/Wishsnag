export function downloadText(filename: string, text: string, type = 'text/plain'): void {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function readFileText(file: File, maxBytes = 50 * 1024 * 1024): Promise<string> {
  if (file.size > maxBytes) return Promise.reject(new Error('File is too large'));
  return file.text();
}

export function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}
