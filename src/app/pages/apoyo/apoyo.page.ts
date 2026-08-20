import { Component, OnInit } from '@angular/core';
import { SesionService } from '../../services/sesion.service';
import { CloudinaryService, ArchivoSubido } from '../../services/cloudinary.service';
import { ToastController, AlertController } from '@ionic/angular';

export interface MaterialApoyo {
  id: number;
  nombre: string;
  descripcion: string;
  tipo: 'PDF' | 'VIDEO' | 'DOC' | 'ENLACE' | 'IMAGEN' | 'OTRO';
  url: string;
  asignatura_id: number;
  asignatura: string;
  grupo_id: number;
  publicado: boolean;
  creado_en: string;
  orden: number;
}

interface Grupo { id: number; nombre: string; grado: number; }
interface Materia { id: number; nombre: string; }

const TIPO_META: Record<string, { icon: string; label: string; accion: string }> = {
  PDF:    { icon: 'document-text-outline', label: 'PDF',     accion: 'Descargar' },
  VIDEO:  { icon: 'videocam-outline',      label: 'Video',   accion: 'Ver'       },
  DOC:    { icon: 'reader-outline',         label: 'Doc',     accion: 'Abrir'     },
  ENLACE: { icon: 'link-outline',           label: 'Enlace',  accion: 'Visitar'   },
  IMAGEN: { icon: 'image-outline',          label: 'Imagen',  accion: 'Ver'       },
  OTRO:   { icon: 'attach-outline',         label: 'Archivo', accion: 'Abrir'     },
};
const COLORES = ['orange','blue','red','green','purple'];

@Component({
  standalone: false,
  selector: 'app-apoyo',
  templateUrl: './apoyo.page.html',
  styleUrls: ['./apoyo.page.scss'],
})
export class ApoyoPage implements OnInit {

  cargando  = true;
  error     = '';
  materiales: MaterialApoyo[] = [];

  // Agrupados por asignatura
  grupos: { asignatura: string; asignatura_id: number; color: string; items: MaterialApoyo[] }[] = [];

  // Búsqueda
  mostrarBuscador = false;
  termino         = '';

  // Docente: subir material
  esDocente = false;
  showForm  = false;
  misGruposOpts:   Grupo[]   = [];
  misMateriasOpts: Materia[]  = [];
  guardando = false;
  subiendoArchivo = false;
  progresoSubida  = 0;
  nuevoMaterial = {
    nombre: '', descripcion: '', tipo: 'PDF' as string,
    url: '', grupoId: null as number | null, materiaId: null as number | null,
  };
  archivoSeleccionado: File | null = null;

  readonly tiposDisponibles = Object.entries(TIPO_META).map(([v, m]) => ({ value: v, ...m }));

  constructor(
    private sesion:     SesionService,
    private cloudinary: CloudinaryService,
    private toastCtrl:  ToastController,
    private alertCtrl:  AlertController,
  ) {}

  ngOnInit() {
    this.esDocente = this.sesion.esDocente();
    if (this.esDocente) this.cargarOpcionesDocente();
    this.cargarMateriales();
  }

  // ═══════════════════════════════════════════════════════════
  // CARGA
  // ═══════════════════════════════════════════════════════════

async cargarMateriales() {
  this.cargando = true;
  this.error = '';
  try {
    let grupoIds: number[] = [];

    // Bloque alumno — agregar p_token:
if (this.sesion.esAlumno()) {
  const { data: usu } = await this.sesion.supabase
    .rpc('perfil_basico_usuario', { p_token: this.sesion.usuario?.token, p_user_id: this.sesion.usuario!.id }).single();
  const gId = (usu as any)?.alumno_grupo_id;
  if (gId) grupoIds = [gId];

// Bloque docente — migrar tabla:
} else if (this.esDocente) {
  const token = this.sesion.usuario?.token || this.sesion.tutor?.token;
    const { data: rel, error: errRel } = await this.sesion.supabase.rpc('grupos_y_materias_del_docente', { p_token: token });
    if (errRel) console.error('Error grupos docente:', errRel.message);
    grupoIds = Array.from(new Set((rel||[]).map((r:any) => r.grupo_id)));

// Bloque tutor — agregar p_token:
} else if (this.sesion.esTutor()) {
  const alumnoId = (this.sesion.usuario as any)?.alumno_id;
  if (alumnoId) {
    const { data: usu } = await this.sesion.supabase
      .rpc('perfil_basico_usuario', { p_token: this.sesion.tutor?.token, p_user_id: alumnoId }).single();
    const gId = (usu as any)?.alumno_grupo_id;
    if (gId) grupoIds = [gId];
  }
}

    if (!grupoIds.length) { this.materiales = []; this.construirGrupos(); return; }

    const token = this.sesion.usuario?.token || this.sesion.tutor?.token;
    const { data, error } = await this.sesion.supabase.rpc('leer_material_apoyo_grupos', { p_token: token, p_grupo_ids: grupoIds });
    if (error) throw error;

    // Nombres de asignaturas
    const asiIds = [...new Set((data||[]).map((m:any) => m.asignatura_id).filter(Boolean))];
    let asiNombres: Record<number,string> = {};
    if (asiIds.length) {
      const token = this.sesion.usuario?.token || this.sesion.tutor?.token;
      const { data: asis } = await this.sesion.supabase.rpc('nombres_asignaturas', { p_token: token, p_ids: asiIds });
      (asis||[]).forEach((a:any) => { asiNombres[a.id] = a.nombre; });
    }

    this.materiales = (data||[]).map((m:any) => ({
      id: m.id,
      nombre: m.titulo,
      descripcion: m.descripcion,
      tipo: m.tipo,
      url: m.archivo || m.url_externa || '',
      asignatura_id: m.asignatura_id,
      asignatura: asiNombres[m.asignatura_id] || 'General',
      grupo_id: m.grupo_id,
      publicado: m.activo,
      creado_en: m.creado_en,
      orden: m.orden,
    }));
    this.construirGrupos();

  } catch (e:any) { this.error = 'Error al cargar el material: ' + e.message; }
  finally { this.cargando = false; }
}

  private construirGrupos() {
    const map = new Map<string, MaterialApoyo[]>();
    const filtrado = this.termino
      ? this.materiales.filter(m => m.nombre.toLowerCase().includes(this.termino.toLowerCase()) ||
          m.asignatura.toLowerCase().includes(this.termino.toLowerCase()))
      : this.materiales;

    filtrado.forEach(m => {
      if (!map.has(m.asignatura)) map.set(m.asignatura, []);
      map.get(m.asignatura)!.push(m);
    });

    let i = 0;
    this.grupos = [...map.entries()].map(([asignatura, items]) => ({
      asignatura, asignatura_id: items[0].asignatura_id,
      color: COLORES[i++ % COLORES.length], items,
    }));
  }

  onBuscar() { this.construirGrupos(); }

  toggleBuscador() {
    this.mostrarBuscador = !this.mostrarBuscador;
    if (!this.mostrarBuscador) { this.termino = ''; this.construirGrupos(); }
  }

  // ═══════════════════════════════════════════════════════════
  // ABRIR RECURSO
  // ═══════════════════════════════════════════════════════════

  openResource(material: MaterialApoyo) {
    if (!material.url) { this.toast('Este recurso no tiene enlace disponible.', 'warning'); return; }
    window.open(material.url, '_blank', 'noopener');
  }

  // ═══════════════════════════════════════════════════════════
  // DOCENTE: SUBIR MATERIAL
  // ═══════════════════════════════════════════════════════════

async cargarOpcionesDocente() {
  const uid = this.sesion.usuario?.id;
  if (!uid) return;

  const token = this.sesion.usuario?.token || this.sesion.tutor?.token;
  const { data: rawG, error: errG } = await this.sesion.supabase.rpc('grupos_y_materias_del_docente', { p_token: token });
  if (errG) { console.error('Error grupos docente:', errG.message); return; }
  if (rawG) {
    const uniqueGroups = new Map();
    rawG.forEach((g:any) => uniqueGroups.set(g.grupo_id, {id: g.grupo_id, nombre: g.grupo_nombre, grado: g.grupo_grado}));
    this.misGruposOpts = Array.from(uniqueGroups.values()).sort((a:any, b:any) => a.grado - b.grado);
  }

  const { data: rawA } = await this.sesion.supabase.rpc('materias_del_docente', { p_token: token });
  if (rawA) { this.misMateriasOpts = rawA; }
}

  async onArchivoSeleccionado(e: any) {
    const file: File = e.target.files[0]; if (!file) return;
    if (file.size / 1048576 > 50) { this.toast('El archivo no puede superar 50 MB.', 'warning'); return; }
    this.archivoSeleccionado = file;
    if (!this.nuevoMaterial.nombre) this.nuevoMaterial.nombre = file.name.replace(/\.[^.]+$/, '');
    // Detectar tipo automáticamente
    const ext = file.name.split('.').pop()?.toLowerCase()||'';
    if (['mp4','mov','avi','webm'].includes(ext)) this.nuevoMaterial.tipo = 'VIDEO';
    else if (['pdf'].includes(ext))               this.nuevoMaterial.tipo = 'PDF';
    else if (['doc','docx','ppt','pptx'].includes(ext)) this.nuevoMaterial.tipo = 'DOC';
    else if (['jpg','jpeg','png','gif'].includes(ext))  this.nuevoMaterial.tipo = 'IMAGEN';
  }

async publicarMaterial() {
  const f = this.nuevoMaterial;
  if (!f.nombre.trim())  { this.toast('Ponle un nombre al material.', 'warning'); return; }
  if (!f.materiaId)      { this.toast('Elige la materia.',             'warning'); return; }
  if (!f.grupoId)        { this.toast('Elige el grupo.',               'warning'); return; }
  if (!this.archivoSeleccionado && !f.url.trim())
    { this.toast('Adjunta un archivo o ingresa un enlace.', 'warning'); return; }

  this.guardando = true;
  try {
    let archivoUrl = '';
    let urlExterna = f.url.trim();

    if (this.archivoSeleccionado) {
      this.subiendoArchivo = true;
      const r = await this.cloudinary.subirArchivo(this.archivoSeleccionado, pct => this.progresoSubida = pct);
      archivoUrl = r.url;
      urlExterna = ''; // si subió archivo, no usamos el campo de enlace
      this.subiendoArchivo = false;
    }

    const token = this.sesion.usuario?.token || this.sesion.tutor?.token;
    const { error } = await this.sesion.supabase.rpc('insertar_material_apoyo_json', {
      p_token: token,
      p_payload: {
        titulo: f.nombre.trim(),
        descripcion: f.descripcion.trim()||null,
        tipo: f.tipo,
        archivo: archivoUrl || null,
        url_externa: urlExterna || null,
        asignatura_id: f.materiaId,
        grupo_id: f.grupoId
      }
    });
    if (error) throw error;

    this.resetForm();
    await this.cargarMateriales();
    this.toast('Material publicado.', 'success');
  } catch (e:any) { this.toast('Error al publicar: '+e.message, 'danger'); }
  finally { this.guardando = false; this.subiendoArchivo = false; }
}

async eliminarMaterial(m: MaterialApoyo, ev: Event) {
  ev.stopPropagation();
  const a = await this.alertCtrl.create({
    header: 'Eliminar material', message: `¿Eliminar "${m.nombre}"?`,
    buttons: [{ text: 'Cancelar', role:'cancel' }, { text:'Eliminar', role:'destructive',
      handler: async () => {
        const token = this.sesion.usuario?.token || this.sesion.tutor?.token;
        await this.sesion.supabase.rpc('eliminar_material_apoyo', { p_token: token, p_material_id: m.id });
        this.materiales = this.materiales.filter(x => x.id !== m.id);
        this.construirGrupos();
        this.toast('Eliminado.', 'success');
      }}],
  });
  await a.present();
}

  private resetForm() {
    this.nuevoMaterial = { nombre:'', descripcion:'', tipo:'PDF', url:'', grupoId:null, materiaId:null };
    this.archivoSeleccionado = null; this.showForm = false; this.progresoSubida = 0;
  }

  // ═══════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════
  getTipoIcon(tipo: string)   { return TIPO_META[tipo]?.icon   || 'attach-outline'; }
  getTipoLabel(tipo: string)  { return TIPO_META[tipo]?.label  || tipo; }
  getTipoAccion(tipo: string) { return TIPO_META[tipo]?.accion || 'Abrir'; }

  getTipoAccionIcon(tipo: string): string {
    return tipo === 'VIDEO' ? 'play-circle-outline' : 'download-outline';
  }

  formatSize(bytes: number|null): string {
    if (!bytes) return '';
    const k=1024, s=['B','KB','MB']; const i=Math.floor(Math.log(bytes)/Math.log(k));
    return (bytes/Math.pow(k,i)).toFixed(1)+' '+s[i];
  }

  doRefresh(ev: any) { this.cargarMateriales().then(() => ev.target.complete()); }

  private async toast(msg: string, color: string) {
    const t = await this.toastCtrl.create({ message:msg, duration:2500, color, position:'bottom' });
    await t.present();
  }
}
