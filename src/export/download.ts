// Descarga un archivo desde una página (Centro) o desde el content script, sin permisos extra:
// un enlace temporal con URL de Blob.
export function downloadFile(data: BlobPart, fileName: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  // Chrome copia el archivo al empezar la descarga; se libera después con margen.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
