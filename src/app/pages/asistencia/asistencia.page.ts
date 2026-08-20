import { Component, OnInit } from '@angular/core';
import { NavController, ToastController, AlertController } from '@ionic/angular';
import { SesionService } from '../../services/sesion.service';

type Estado = 'P' | 'A' | 'R';

interface Alumno {
  id: number;
  numero: number;
  nombre: string;
  apellido: string;
  foto: string | null;
  estado: Estado;
  guardado: boolean;
  revisado: boolean;
}

interface GrupoDeMateria {
  id: number;
  nombre: string;
  grado: number;
  aula: string;
  totalAlumnos: number;
  tomada: boolean;
}

interface MateriaConGrupos {
  id: number;
  nombre: string;
  grupos: GrupoDeMateria[];
}

interface HistorialItem {
  fecha: string;
  presentes: number;
  retardos: number;
  ausentes: number;
  total: number;
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES_LARGO = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];
const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

@Component({
  standalone: false,
  selector: 'app-asistencia',
  templateUrl: './asistencia.page.html',
  styleUrls: ['./asistencia.page.scss'],
})
export class AsistenciaPage implements OnInit {

  vista: 'selector' | 'tomar' = 'selector';

  materias: MateriaConGrupos[] = [];
  cargandoGrupos = false;
  errorGrupos: string | null = null;

  materiaId!: number;
  materiaNombre = '';
  grupoId!: number;
  grupoNombre = '';
  grupoGrado: number | null = null;
  grupoAula = '';

  fechaSeleccionada = new Date();
  mostrarSelectorFecha = false;

  alumnos: Alumno[] = [];
  filtroAlumno = '';
  private snapshotEstados: Map<number, Estado> = new Map();

  cargando = false;
  guardando = false;
  error: string | null = null;
  yaGuardada = false;

  segmento: 'lista' | 'historial' = 'lista';

  historial: HistorialItem[] = [];
  cargandoHistorial = false;
  errorHistorial: string | null = null;

  get totalPresentes(): number { return this.alumnos.filter(a => a.estado === 'P').length; }
  get totalAusentes():  number { return this.alumnos.filter(a => a.estado === 'A').length; }
  get totalRetardos():  number { return this.alumnos.filter(a => a.estado === 'R').length; }
  get totalSinRevisar(): number { return this.alumnos.filter(a => !a.revisado).length; }
  get porcentaje():     number {
    if (!this.alumnos.length) return 0;
    return Math.round(((this.totalPresentes + this.totalRetardos * 0.5) / this.alumnos.length) * 100);
  }

  get alumnosFiltrados(): Alumno[] {
    const q = this.filtroAlumno.trim().toLowerCase();
    if (!q) return this.alumnos;
    return this.alumnos.filter(a =>
      `${a.nombre} ${a.apellido}`.toLowerCase().includes(q)
    );
  }

  get hayCambiosSinGuardar(): boolean {
    if (!this.alumnos.length) return false;
    return this.alumnos.some(a => this.snapshotEstados.get(a.id) !== a.estado);
  }

  get grupoEtiqueta(): string {
    if (this.grupoGrado == null) return this.grupoNombre;
    const base = `${this.grupoGrado}° ${this.grupoNombre}`;
    const aula = this.formatAula(this.grupoAula);
    return aula ? `${base} — ${aula}` : base;
  }

  formatAula(aula: string | null | undefined): string {
    if (!aula) return '';
    const limpio = aula.trim();
    return /^aula\b/i.test(limpio) ? limpio : `Aula ${limpio}`;
  }

  get hoyISO(): string {
    return this.toDateStr(new Date());
  }

  get fechaSeleccionadaISO(): string {
    return this.toDateStr(this.fechaSeleccionada);
  }

  get esHoy(): boolean {
    return this.fechaSeleccionadaISO === this.hoyISO;
  }

  get fechaSeleccionadaDisplay(): string {
    const dia = DIAS[this.fechaSeleccionada.getDay()];
    const mes = MESES_LARGO[this.fechaSeleccionada.getMonth()];
    return `${dia} ${this.fechaSeleccionada.getDate()} de ${mes}`;
  }

  constructor(
    private navCtrl: NavController,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private sesion: SesionService
  ) {}

  ngOnInit() {
    this.cargarGrupos();
  }

  // ═══════════════════════════════════════════════════════════════════════════════════
  // SELECTOR DE MATERIA + GRUPO
  // ═══════════════════════════════════════════════════════════════════════════════════

  async cargarGrupos() {
    if (!this.sesion.esDocente()) {
      this.errorGrupos = 'Esta sección es solo para maestros.';
      return;
    }

    this.cargandoGrupos = true;
    this.errorGrupos = null;

    try {
      const docenteId = this.sesion.usuario!.id;
      const token = this.sesion.usuario?.token;

      if (!token) throw new Error('Sin token de autenticación');

      // 1. Obtener grupos y materias asignados a este docente
      const { data: rawRelaciones, error: errRel } = await this.sesion.supabase
        .rpc('grupos_y_materias_del_docente', { p_token: token });
      if (errRel) throw errRel;

      if (!rawRelaciones || rawRelaciones.length === 0) {
        this.materias = [];
        return;
      }

      // 2. Extraer IDs únicos
      const materiaIds = [...new Set((rawRelaciones as any[]).map(r => r.asignatura_id))];
      const grupoIds = [...new Set((rawRelaciones as any[]).map(r => r.grupo_id))];

      // 3. Cargar datos de materias
      const { data: materiasData, error: eMat } = await this.sesion.supabase
        .rpc('nombres_asignaturas', { p_token: token, p_ids: materiaIds });
      if (eMat) throw eMat;

      // 4. Cargar datos de grupos
      const { data: gruposData, error: eGrup } = await this.sesion.supabase
        .rpc('nombres_grupos', { p_token: token, p_ids: grupoIds });
      if (eGrup) throw eGrup;

      // 5. Contar alumnos por grupo
      const { data: alumnosData, error: eAlu } = await this.sesion.supabase
        .rpc('alumnos_por_grupos', { p_token: token, p_grupo_ids: grupoIds });
      if (eAlu) throw eAlu;

      const conteoPorGrupo = new Map<number, number>();
      (alumnosData || []).forEach((a: any) => {
        conteoPorGrupo.set(a.alumno_grupo_id, (conteoPorGrupo.get(a.alumno_grupo_id) || 0) + 1);
      });

      // 6. Obtener qué combos materia+grupo ya tienen lista en la fecha elegida
      const fechaStr = this.toDateStr(this.fechaSeleccionada);
      const { data: asistFecha } = await this.sesion.supabase
        .rpc('combos_con_lista', { p_token: token, p_grupo_ids: grupoIds, p_materia_ids: materiaIds, p_fecha: fechaStr });

      const combosConLista = new Set(
        (asistFecha || []).map((a: any) => `${a.asignatura_id}-${a.grupo_id}`)
      );

      // 7. Construir estructura: materias con sus grupos
      const infoPorGrupo = new Map<number, { nombre: string; grado: number; aula: string }>(
        (gruposData || []).map((g: any) => [g.id, { nombre: g.nombre, grado: g.grado, aula: g.aula }])
      );

      this.materias = (materiasData || [])
        .map((m: any) => {
          const gruposDeMateria = (rawRelaciones as any[])
            .filter(r => r.asignatura_id === m.id)
            .map(r => r.grupo_id);

          const gruposUnicos = [...new Set(gruposDeMateria)];
          const grupos: GrupoDeMateria[] = gruposUnicos
            .map(gid => {
              const info = infoPorGrupo.get(gid);
              return {
                id: gid,
                nombre: info?.nombre || `Grupo #${gid}`,
                grado: info?.grado ?? 0,
                aula: info?.aula || '',
                totalAlumnos: conteoPorGrupo.get(gid) || 0,
                tomada: combosConLista.has(`${m.id}-${gid}`),
              };
            })
            .sort((a, b) => a.grado - b.grado || a.nombre.localeCompare(b.nombre));

          return { id: m.id, nombre: m.nombre, grupos };
        })
        .filter((m: MateriaConGrupos) => m.grupos.length > 0);

    } catch (err: any) {
      console.error('Error cargando materias/grupos:', err.message);
      this.errorGrupos = `No se pudieron cargar tus materias y grupos. Detalle: ${err.message || err}`;
    } finally {
      this.cargandoGrupos = false;
    }
  }

  seleccionarGrupo(materia: MateriaConGrupos, grupo: GrupoDeMateria) {
    this.materiaId = materia.id;
    this.materiaNombre = materia.nombre;
    this.grupoId = grupo.id;
    this.grupoNombre = grupo.nombre;
    this.grupoGrado = grupo.grado;
    this.grupoAula = grupo.aula;
    this.vista = 'tomar';
    this.segmento = 'lista';
    this.historial = [];
    this.errorHistorial = null;
    this.cargarAlumnos();
  }

  private parseISO(iso: string): Date {
    const [y, m, d] = iso.split('T')[0].split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  async onFechaChange(valor: string | string[] | null | undefined) {
    const valorISO = Array.isArray(valor) ? valor[0] : valor;
    if (!valorISO) { this.mostrarSelectorFecha = false; return; }
    const nuevaFecha = this.parseISO(valorISO);

    if (this.toDateStr(nuevaFecha) === this.fechaSeleccionadaISO) {
      this.mostrarSelectorFecha = false;
      return;
    }
    this.mostrarSelectorFecha = false;
    await this.cambiarFecha(nuevaFecha);
  }

  irAHoy() {
    if (this.esHoy) return;
    this.cambiarFecha(new Date());
  }

  abrirDiaHistorial(fechaISO: string) {
    this.cambiarFecha(this.parseISO(fechaISO), true);
  }

  private async cambiarFecha(nuevaFecha: Date, forzarSegmentoLista = false) {
    const aplicarCambio = async () => {
      this.fechaSeleccionada = nuevaFecha;
      if (forzarSegmentoLista) this.segmento = 'lista';
      if (this.vista === 'selector') {
        await this.cargarGrupos();
      } else {
        await this.cargarAlumnos();
      }
    };

    if (this.vista === 'tomar' && this.hayCambiosSinGuardar) {
      const alert = await this.alertCtrl.create({
        header: 'Cambios sin guardar',
        message: 'Cambiar de fecha descartará los cambios sin guardar de la lista actual. ¿Deseas continuar?',
        cssClass: 'asist-alert',
        buttons: [
          { text: 'Cancelar', role: 'cancel' },
          { text: 'Cambiar de todas formas', role: 'destructive', handler: aplicarCambio },
        ],
      });
      await alert.present();
      return;
    }

    await aplicarCambio();
  }

  async onRefresh(event: any) {
    try {
      if (this.vista === 'selector') {
        await this.cargarGrupos();
      } else if (this.segmento === 'historial') {
        await this.cargarHistorial();
      } else {
        await this.cargarAlumnos();
      }
    } finally {
      event?.target?.complete();
    }
  }

  async volver() {
    if (this.vista === 'tomar') {
      if (this.segmento === 'lista' && this.hayCambiosSinGuardar) {
        const alert = await this.alertCtrl.create({
          header: 'Cambios sin guardar',
          message: 'Tienes cambios en la lista que no has guardado. ¿Deseas salir de todas formas?',
          cssClass: 'asist-alert',
          buttons: [
            { text: 'Seguir editando', role: 'cancel' },
            { text: 'Salir sin guardar', role: 'destructive', handler: () => this.irASelector() },
          ],
        });
        await alert.present();
        return;
      }
      this.irASelector();
      return;
    }
    this.navCtrl.back();
  }

  private irASelector() {
    this.vista = 'selector';
    this.alumnos = [];
    this.historial = [];
    this.error = null;
    this.errorHistorial = null;
    this.cargarGrupos();
  }

  // ═══════════════════════════════════════════════════════════════════════════════════
  // TOMAR LISTA
  // ═══════════════════════════════════════════════════════════════════════════════════

  async cargarAlumnos() {
    this.cargando = true;
    this.error = null;
    try {
      const token = this.sesion.usuario?.token;
      if (!token) throw new Error('Sin token de autenticación');

      // Obtener alumnos del grupo
      const { data: users, error: e1 } = await this.sesion.supabase
        .from('users_user')
        .select('id, first_name, last_name, foto_perfil')
        .eq('alumno_grupo_id', this.grupoId)
        .order('last_name');
      if (e1) throw e1;

      // Asistencia registrada para esta materia+grupo+fecha
      const fechaStr = this.toDateStr(this.fechaSeleccionada);
      const { data: asist } = await this.sesion.supabase
        .rpc('asistencia_del_dia', { p_token: token, p_grupo_id: this.grupoId, p_materia_id: this.materiaId, p_fecha: fechaStr });

      const asistMap = new Map((asist || []).map((a: any) => [a.alumno_id, a.estado]));
      this.yaGuardada = asistMap.size > 0;

      this.alumnos = (users || []).map((u: any, i: number) => ({
        id:       u.id,
        numero:   i + 1,
        nombre:   u.first_name || '',
        apellido: u.last_name || '',
        foto:     u.foto_perfil,
        estado:   (asistMap.get(u.id) as Estado) ?? 'P',
        guardado: asistMap.has(u.id),
        revisado: asistMap.has(u.id),
      }));

      this.filtroAlumno = '';
      this.snapshotEstados = new Map(this.alumnos.map(a => [a.id, a.estado]));

    } catch (err: any) {
      console.error('Error cargando alumnos:', err.message);
      this.error = 'No se pudo cargar la lista. Verifica tu conexión.';
    } finally {
      this.cargando = false;
    }
  }

  iniciales(alumno: Alumno): string {
    const n = alumno.nombre?.charAt(0) || '';
    const a = alumno.apellido?.charAt(0) || '';
    return (n + a).toUpperCase() || '?';
  }

  setEstado(alumno: Alumno, estado: Estado) {
    alumno.estado = estado;
    alumno.revisado = true;
  }

  async confirmarMarcarTodos(estado: Estado) {
    if (!this.alumnos.length) return;

    const etiqueta = estado === 'P' ? 'presentes' : estado === 'A' ? 'ausentes' : 'con retardo';
    const alert = await this.alertCtrl.create({
      header: 'Confirmar acción',
      message: `Vas a marcar a los ${this.alumnos.length} alumnos como ${etiqueta}. ¿Continuar?`,
      cssClass: 'asist-alert',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Sí, marcar a todos', handler: () => this.marcarTodos(estado) },
      ],
    });
    await alert.present();
  }

  private marcarTodos(estado: Estado) {
    this.alumnos.forEach(a => { a.estado = estado; a.revisado = true; });
  }

  async guardarLista() {
    if (!this.alumnos.length || this.guardando) return;

    if (!this.esHoy) {
      const alert = await this.alertCtrl.create({
        header: 'Fecha distinta a hoy',
        message: `Vas a guardar la asistencia del ${this.fechaSeleccionadaDisplay}, no la de hoy. ¿Es correcto?`,
        cssClass: 'asist-alert',
        buttons: [
          { text: 'Cancelar', role: 'cancel' },
          { text: 'Sí, es correcto', handler: () => this.confirmarSobrescrituraYGuardar() },
        ],
      });
      await alert.present();
      return;
    }

    await this.confirmarSobrescrituraYGuardar();
  }

  private async confirmarSobrescrituraYGuardar() {
    if (this.yaGuardada) {
      const alert = await this.alertCtrl.create({
        header: 'Lista ya registrada',
        message: `Ya existe una lista guardada el ${this.fechaSeleccionadaDisplay} para "${this.materiaNombre}" en este grupo. ¿Deseas sobrescribirla con los cambios actuales?`,
        cssClass: 'asist-alert',
        buttons: [
          { text: 'Cancelar', role: 'cancel' },
          { text: 'Sobrescribir', handler: () => this.confirmarResumenYGuardar() },
        ],
      });
      await alert.present();
      return;
    }

    await this.confirmarResumenYGuardar();
  }

  private async confirmarResumenYGuardar() {
    const pctAusentes = this.alumnos.length
      ? Math.round((this.totalAusentes / this.alumnos.length) * 100)
      : 0;

    let mensaje =
      `<strong>${this.materiaNombre} · Grupo ${this.grupoNombre}</strong><br>` +
      `${this.fechaSeleccionadaDisplay}<br>` +
      `${this.totalPresentes} presentes · ${this.totalRetardos} retardos · ${this.totalAusentes} ausentes`;

    if (pctAusentes >= 30) {
      mensaje += `<br><br>⚠️ ${pctAusentes}% de ausentismo, verifica antes de guardar.`;
    }
    if (this.totalSinRevisar > 0) {
      mensaje += `<br><br>⚠️ ${this.totalSinRevisar} alumno(s) sin revisar (quedaron en "Presente" por defecto).`;
    }

    const alert = await this.alertCtrl.create({
      header: 'Confirmar asistencia',
      message: mensaje,
      cssClass: 'asist-alert',
      buttons: [
        { text: 'Revisar de nuevo', role: 'cancel' },
        { text: 'Guardar', handler: () => this.ejecutarGuardado() },
      ],
    });
    await alert.present();
  }

  private async ejecutarGuardado() {
    this.guardando = true;
    const fechaStr = this.toDateStr(this.fechaSeleccionada);

    const registros = this.alumnos.map(a => ({
      alumno_id:     a.id,
      grupo_id:      this.grupoId,
      asignatura_id: this.materiaId,
      fecha:         fechaStr,
      estado:        a.estado,
    }));

    const token = this.sesion.usuario?.token;
    const { error } = token
      ? await this.sesion.supabase.rpc('guardar_asistencia', { p_token: token, p_grupo_id: this.grupoId, p_materia_id: this.materiaId, p_registros: registros })
      : { error: { message: 'Sesión no válida' } };

    this.guardando = false;

    if (error) {
      this.mostrarToast(`Error al guardar. Detalle: ${error.message}`, 'danger');
      console.error(error.message);
      return;
    }

    this.alumnos.forEach(a => { a.guardado = true; a.revisado = true; });
    this.snapshotEstados = new Map(this.alumnos.map(a => [a.id, a.estado]));
    this.yaGuardada = true;
    this.mostrarToast(`Lista guardada · ${this.totalPresentes}P ${this.totalRetardos}R ${this.totalAusentes}A`, 'success');
    this.historial = [];
  }

  async onSegmentoChange() {
    if (this.segmento === 'historial' && !this.historial.length) {
      await this.cargarHistorial();
    }
  }

  async cargarHistorial() {
    this.cargandoHistorial = true;
    this.errorHistorial = null;

    const token = this.sesion.usuario?.token;
    const { data, error } = token
      ? await this.sesion.supabase.rpc('historial_asistencia', { p_token: token, p_grupo_id: this.grupoId, p_materia_id: this.materiaId })
      : { data: [] as any[], error: null };

    if (error) {
      console.error('Error cargando historial:', error.message);
      this.errorHistorial = 'No se pudo cargar el historial. Verifica tu conexión.';
      this.historial = [];
      this.cargandoHistorial = false;
      return;
    }

    const porFecha = new Map<string, { P: number; A: number; R: number }>();
    (data || []).forEach((r: any) => {
      if (!porFecha.has(r.fecha)) porFecha.set(r.fecha, { P: 0, A: 0, R: 0 });
      const d = porFecha.get(r.fecha)!;
      d[r.estado as Estado]++;
    });

    this.historial = Array.from(porFecha.entries())
      .map(([fecha, cnt]) => ({
        fecha,
        presentes: cnt.P,
        retardos:  cnt.R,
        ausentes:  cnt.A,
        total:     cnt.P + cnt.A + cnt.R,
      }))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));

    this.cargandoHistorial = false;
  }

  formatFecha(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${d} ${MESES_CORTO[+m - 1]} ${y}`;
  }

  porcentajeHistorial(item: HistorialItem): number {
    if (!item.total) return 0;
    return Math.round(((item.presentes + item.retardos * 0.5) / item.total) * 100);
  }

  private toDateStr(d: Date): string {
    const y  = d.getFullYear();
    const m  = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  private async mostrarToast(msg: string, color: string) {
    const t = await this.toastCtrl.create({
      message: msg, duration: 2500, color,
      position: 'bottom', cssClass: 'asist-toast'
    });
    await t.present();
  }
}
