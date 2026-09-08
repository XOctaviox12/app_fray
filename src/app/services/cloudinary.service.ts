import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';

export interface ArchivoSubido {
  name:     string;
  url:      string;
  size:     number;
  type:     string;
  publicId: string;
}

@Injectable({ providedIn: 'root' })
export class CloudinaryService {

  private readonly uploadUrl =
    `https://api.cloudinary.com/v1_1/${environment.cloudinaryCloudName}/auto/upload`;


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

          reject(new Error(`Error ${xhr.status} subiendo archivo. Verifica el upload preset.`));
        }
      };

      xhr.onerror = () => reject(new Error('Error de red al subir el archivo.'));
      xhr.send(fd);
    });
  }

   
  async subirVarios(files: File[], onProgress?: (i: number, pct: number) => void): Promise<ArchivoSubido[]> {
    const resultados: ArchivoSubido[] = [];
    for (let i = 0; i < files.length; i++) {
      const subido = await this.subirArchivo(files[i], pct => onProgress?.(i, pct));
      resultados.push(subido);
    }
    return resultados;
  }
}
