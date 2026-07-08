import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';

export interface ArchivoSubido {
  name:     string;
  url:      string;    // secure_url de Cloudinary
  size:     number;
  type:     string;
  publicId: string;    // para borrar después si hace falta
}

@Injectable({ providedIn: 'root' })
export class CloudinaryService {

  private readonly uploadUrl =
    `https://api.cloudinary.com/v1_1/${environment.cloudinaryCloudName}/auto/upload`;

  /**
   * Sube un archivo usando un upload preset SIN FIRMA (configurado en el
   * dashboard de Cloudinary como "Unsigned"). No expone el API_SECRET.
   * onProgress recibe 0-100 para mostrar barra de avance.
   */
  subirArchivo(file: File, onProgress?: (pct: number) => void): Promise<ArchivoSubido> {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('upload_preset', environment.cloudinaryUploadPreset);
      fd.append('folder', 'frayhub/tareas');

      const xhr = new XMLHttpRequest();
      xhr.open('POST', this.uploadUrl, true);

      xhr.upload.onprogress = (e) => {
        if (onProgress && e.lengthComputable)
          onProgress(Math.round((e.loaded / e.total) * 100));
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve({ name: file.name, url: data.secure_url,
                      size: file.size,  type: file.type, publicId: data.public_id });
          } catch {
            reject(new Error('Respuesta inválida de Cloudinary.'));
          }
        } else {
          // Causa más común: el preset no existe o no es "Unsigned" en el dashboard.
          reject(new Error(`Error ${xhr.status} subiendo archivo. Verifica el upload preset.`));
        }
      };

      xhr.onerror = () => reject(new Error('Error de red al subir el archivo.'));
      xhr.send(fd);
    });
  }

  /** Sube varios archivos en secuencia reportando progreso por índice. */
  async subirVarios(files: File[], onProgress?: (i: number, pct: number) => void): Promise<ArchivoSubido[]> {
    const resultados: ArchivoSubido[] = [];
    for (let i = 0; i < files.length; i++) {
      const subido = await this.subirArchivo(files[i], pct => onProgress?.(i, pct));
      resultados.push(subido);
    }
    return resultados;
  }
}