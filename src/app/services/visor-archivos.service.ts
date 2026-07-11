import { Injectable } from '@angular/core';
import { Browser } from '@capacitor/browser';
import { environment } from '../../environments/environment';

export interface ArchivoAdjunto {
  name: string;
  url: string;
}

/**
 * Servicio centralizado para normalizar y abrir archivos adjuntos
 * (tareas, actividades, material de apoyo, entregas, etc.) de forma
 * consistente en web, iPad (iOS/Capacitor) y Android (Capacitor).
 *
 * Resuelve tres problemas separados:
 *  1) El campo `archivo` en la BD viene en formatos mezclados
 *     (normalizarUrl / normalizarArchivos).
 *  2) El navegador in-app no renderiza todos los formatos igual, y
 *     algunos dispositivos Android no traen NINGÚN lector de PDF
 *     instalado (ni Chrome configurado como manejador, ni Drive, ni
 *     Adobe), por lo que el sistema solo ofrece "abrir con Bloc de
 *     Notas" y falla. Para evitar depender de lo que tenga instalado
 *     el dispositivo, PDF y los formatos de Office se renderizan
 *     siempre con un visor externo en vez de descargarse.
 *  3) Algunos navegadores in-app instalados en tablets Android (ej.
 *     Samsung Internet en modelos viejos) traen un motor de
 *     JavaScript desactualizado que NO soporta la sintaxis moderna
 *     que usa la build actual de PDF.js (mozilla.github.io/pdf.js):
 *     la pantalla queda en blanco sin ningún error visible para el
 *     usuario. Por eso PDF usa específicamente la build "legacy" que
 *     Mozilla mantiene para navegadores sin soporte de JS reciente.
 *
 * Imágenes y video SÍ se renderizan nativos en el navegador in-app,
 * así que esos van directo sin pasar por ningún visor externo.
 */
@Injectable({
  providedIn: 'root'
})
export class VisorArchivosService {

  private readonly EXTENSIONES_OFFICE = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];

  private readonly CLOUD_NAME = environment.cloudinaryCloudName;

  /**
   * Normaliza cualquiera de los formatos con los que puede venir el campo
   * `archivo` en la base de datos y devuelve SIEMPRE una URL absoluta y
   * limpia, lista para pasar a `abrir()`.
   *
   * Formatos soportados:
   *  - Ruta relativa:        image/upload/v.../archivo.pdf
   *  - Ruta relativa raw:    raw/upload/v.../archivo.pdf
   *  - Doble prefijo corrupto: raw/upload/https://res.cloudinary.com/...
   *  - URL completa limpia:  https://res.cloudinary.com/...
   */
  normalizarUrl(valor: string | null | undefined): string {
    if (!valor) return '';

    let url = valor.trim();

    // Caso: doble prefijo corrupto -> quedarnos solo con la URL embebida
    const idxHttp = url.indexOf('https://');
    const idxHttp2 = url.indexOf('http://');
    const idx = idxHttp !== -1 ? idxHttp : idxHttp2;

    if (idx > 0) {
      // Hay un prefijo (raw/upload/, image/upload/, etc.) ANTES de la URL real
      url = url.substring(idx);
    }

    // Caso: ya es una URL completa (limpia o recién extraída del doble prefijo)
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    // Caso: ruta relativa de Cloudinary (image/upload/... o raw/upload/...)
    // Se limpia cualquier slash inicial y se reconstruye con el cloudName.
    const rutaLimpia = url.replace(/^\/+/, '');
    return `https://res.cloudinary.com/${this.CLOUD_NAME}/${rutaLimpia}`;
  }

  /**
   * Normaliza el caso en que el campo `archivo` contiene un JSON con
   * múltiples adjuntos: [{"name":"...","url":"..."}]
   * Si el valor no es JSON válido, lo trata como un único archivo y
   * devuelve un arreglo de un solo elemento.
   */
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
        // No era JSON válido a pesar de empezar con [ o { -> tratar como archivo simple
      }
    }

    return [{
      name: this.obtenerNombreDeUrl(texto),
      url: this.normalizarUrl(texto)
    }];
  }

  /**
   * Abre una URL de archivo ya normalizada en el visor más apropiado
   * según su tipo, de forma consistente en web, iPad y Android.
   *
   * - PDF: build "legacy" de PDF.js (mozilla.github.io/pdf.js/legacy).
   *   No depende de que el dispositivo tenga un lector instalado, y
   *   funciona incluso en navegadores in-app con motor de JS viejo.
   * - Office (doc/docx/xls/xlsx/ppt/pptx): Google Docs Viewer.
   * - Imágenes (jpg, png, gif, webp, etc.): navegador in-app directo,
   *   lo renderiza nativo.
   * - Video (mp4, mov, etc.): navegador in-app directo, lo reproduce
   *   nativo con controles del sistema.
   * - Cualquier otro formato: navegador in-app directo, como fallback.
   */
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
      // Sin &embedded=true: ese parámetro es para cuando el visor se
      // incrusta dentro de un <iframe>. Al abrirse como página completa
      // (que es lo que hace Browser.open), causaba pantalla en blanco.
      const urlVisor = `https://docs.google.com/viewer?url=${encodeURIComponent(urlLimpia)}`;
      await Browser.open({ url: urlVisor });
      return;
    }

    // Imágenes, video, y cualquier otro formato renderizable nativo.
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
