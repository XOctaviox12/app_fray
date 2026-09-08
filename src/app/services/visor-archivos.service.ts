import { Injectable } from '@angular/core';
import { Browser } from '@capacitor/browser';
import { environment } from '../../environments/environment';

export interface ArchivoAdjunto {
  name: string;
  url: string;
}

@Injectable({
  providedIn: 'root'
})
export class VisorArchivosService {

  private readonly EXTENSIONES_OFFICE = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];

  private readonly CLOUD_NAME = environment.cloudinaryCloudName;

  normalizarUrl(valor: string | null | undefined): string {
    if (!valor) return '';

    let url = valor.trim();


    const idxHttp = url.indexOf('https://');
    const idxHttp2 = url.indexOf('http://');
    const idx = idxHttp !== -1 ? idxHttp : idxHttp2;

    if (idx > 0) {

      url = url.substring(idx);
    }


    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }


    const rutaLimpia = url.replace(/^\/+/, '');
    return `https://res.cloudinary.com/${this.CLOUD_NAME}/${rutaLimpia}`;
  }


  normalizarArchivos(valor: string | null | undefined): ArchivoAdjunto[] {
    if (!valor) return [];

    const texto = valor.trim();

    if (texto.startsWith('[') || texto.startsWith('{')) {
      try {
        const parsed = JSON.parse(texto);
        const lista: any[] = Array.isArray(parsed) ? parsed : [parsed];
        return lista
          .filter(item => item && item.url)
          .map(item => ({
            name: item.name || this.obtenerNombreDeUrl(item.url),
            url: this.normalizarUrl(item.url)
          }));
      } catch {

      }
    }

    return [{
      name: this.obtenerNombreDeUrl(texto),
      url: this.normalizarUrl(texto)
    }];
  }

  async abrir(url: string): Promise<void> {
    const urlLimpia = this.normalizarUrl(url);
    if (!urlLimpia) return;

    const extension = this.obtenerExtension(urlLimpia);

    if (extension === 'pdf') {
      const urlVisor = `https://mozilla.github.io/pdf.js/legacy/web/viewer.html?file=${encodeURIComponent(urlLimpia)}`;
      await Browser.open({ url: urlVisor });
      return;
    }

    if (this.EXTENSIONES_OFFICE.includes(extension)) {

      const urlVisor = `https://docs.google.com/viewer?url=${encodeURIComponent(urlLimpia)}`;
      await Browser.open({ url: urlVisor });
      return;
    }

     
    await Browser.open({ url: urlLimpia });
  }

  private obtenerExtension(url: string): string {
    const limpio = url.split('?')[0].split('#')[0];
    const partes = limpio.split('.');
    return partes.length > 1 ? partes[partes.length - 1].toLowerCase() : '';
  }

  private obtenerNombreDeUrl(url: string): string {
    const limpio = url.split('?')[0].split('#')[0];
    const partes = limpio.split('/');
    return partes[partes.length - 1] || 'archivo';
  }
}
