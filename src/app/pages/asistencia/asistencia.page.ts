import { Component, OnInit } from '@angular/core';
import { NavController, ToastController, AlertController } from '@ionic/angular';
import { SesionService } from '../../services/sesion.service';

type Estado = 'P' | 'A' | 'R';

interface Alumno {
  id: number;
  numero: number; // posición fija en la lista, no cambia al filtrar
  nombre: string;
  apellido: string;
  foto: string | null;
  estado: Estado;
  guardado: boolean; // true si ya hay registro en la fecha seleccionada
  revisado: boolean; // true si el maestro ya tocó algún botón para este alumno
}

interface GrupoDeMateria {
  id: number;
  nombre: string;
  grado: number;
  aula: string;
  totalAlumnos: number;
  tomada: boolean; // ya se tomó lista en esta materia+grupo, en la fecha seleccionada
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

  // ── Vista general ──────────────────────────────────────────
  // 'selector' = eligiendo materia+grupo · 'tomar' = pasando lista / historial
  vista: 'selector' | 'tomar' = 'selector';

  // ── Selector de materia + grupo ──────────────────────────────
  materias: MateriaConGrupos[] = [];
  cargandoGrupos = false;
  errorGrupos: string | null = null;

  // ── Materia + grupo activos ───────────────────────────────────
  materiaId!: number;
  materiaNombre = '';
  grupoId!: number;
  grupoNombre = '';
  grupoGrado: number | null = null;
  grupoAula = '';

  // ── Fecha seleccionada para tomar/editar asistencia ─────────
  // Por defecto hoy. El maestro puede elegir una fecha pasada para
  // capturar o corregir listas atrasadas; no se permiten fechas futuras.
  fechaSeleccionada = new Date();
  mostrarSelectorFecha = false;

  alumnos: Alumno[] = [];
  filtroAlumno = '';
  private snapshotEstados: Map<number, Estado> = new Map(); // para detectar cambios sin guardar

  cargando = false;
  guardando = false;
  error: string | null = null;
  yaGuardada = false; // lista de esta materia+grupo+fecha ya existe

  // Segmento activo dentro de 'tomar'
  segmento: 'lista' | 'historial' = 'lista';

  // Historial (de esta materia+grupo), siempre ordenado descendente por fecha
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

  // Etiqueta compacta del grupo activo, ej: "1° A — Aula 205"
  get grupoEtiqueta(): string {
    if (this.grupoGrado == null) return this.grupoNombre;
    const base = `${this.grupoGrado}° ${this.grupoNombre}`;
    const aula = this.formatAula(this.grupoAula);
    return aula ? `${base} — ${aula}` : base;
  }

  // Normaliza el texto del aula: si el dato guardado ya trae la palabra
  // "Aula" (ej. "Aula 101") no la duplica; si trae solo el número/nombre
  // (ej. "101"), le antepone "Aula".
  formatAula(aula: string | null | undefined): string {
    if (!aula) return '';
    const limpio = aula.trim();
    return /^aula\b/i.test(limpio) ? limpio : `Aula ${limpio}`;
  }

  // ── Fecha: helpers de UI ─────────────────────────────────────
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

  // ═══════════════════════════════════════════════════════════
  // SELECTOR DE MATERIA + GRUPO
  // ═══════════════════════════════════════════════════════════

  async cargarGrupos() {
    if (!this.sesion.esDocente()) {
      this.errorGrupos = 'Esta sección es solo para maestros.';
      return;
    }

    this.cargandoGrupos = true;
    this.errorGrupos = null;

    try {
      const docenteId = this.sesion.usuario!.id;

      // 1. Materias que da este maestro
      const { data: relMat, error: eMat } = await this.sesion.supabase
        .from('academic_asignatura_docentes')
        .select('asignatura_id')
        .eq('user_id', docenteId);
      if (eMat) throw eMat;

      const materiaIds = [...new Set((relMat || []).map((r: any) => r.asignatura_id))];
      if (materiaIds.length === 0) {
        this.materias = [];
        return;
      }

      const { data: materiasData, error: eMatNom } = await this.sesion.supabase
        .from('academic_asignatura')
        .select('id, nombre')
        .in('id', materiaIds)
        .order('nombre');
      if (eMatNom) throw eMatNom;

      // 2. Grupos donde se imparte cada materia
      const { data: relAsigGrupo, error: eAG } = await this.sesion.supabase
        .from('academic_asignatura_grupos')
        .select('asignatura_id, grupo_id')
        .in('asignatura_id', materiaIds);
      if (eAG) throw eAG;

      // 3. Grupos donde este maestro está asignado (filtro de seguridad,
      //    evita mostrar grupos ajenos si la materia la comparten varios
      //    maestros con distintos grupos)
      const { data: relGrupoDoc, error: eGD } = await this.sesion.supabase
        .from('academic_grupo_docentes')
        .select('grupo_id')
        .eq('user_id', docenteId);
      if (eGD) throw eGD;
      const misGrupoIds = new Set((relGrupoDoc || []).map((r: any) => r.grupo_id));

      // Construir, por materia, la lista de grupo_id válidos (intersección)
      const grupoIdsPorMateria = new Map<number, number[]>();
      (relAsigGrupo || []).forEach((r: any) => {
        if (!misGrupoIds.has(r.grupo_id)) return;
        const lista = grupoIdsPorMateria.get(r.asignatura_id) || [];
        lista.push(r.grupo_id);
        grupoIdsPorMateria.set(r.asignatura_id, lista);
      });

      const todosGrupoIds = [...new Set(
        Array.from(grupoIdsPorMateria.values()).flat()
      )];

      if (todosGrupoIds.length === 0) {
        this.materias = (materiasData || []).map((m: any) => ({ id: m.id, nombre: m.nombre, grupos: [] }));
        return;
      }

      // 4. Datos de esos grupos (nombre, grado, aula)
      const { data: gruposData, error: eGrupos } = await this.sesion.supabase
        .from('academic_grupo')
        .select('id, nombre, grado, aula')
        .in('id', todosGrupoIds);
      if (eGrupos) throw eGrupos;
      const infoPorGrupo = new Map(
        (gruposData || []).map((g: any) => [g.id, { nombre: g.nombre, grado: g.grado, aula: g.aula }])
      );

      // 5. Cantidad de alumnos por grupo (una sola consulta)
      // TODO(schema): confirmar columna real de FK alumno→grupo (alumno_grupo_id)
      const { data: alumnosData } = await this.sesion.supabase
        .from('users_user')
        .select('id, alumno_grupo_id')
        .in('alumno_grupo_id', todosGrupoIds);

      const conteoPorGrupo = new Map<number, number>();
      (alumnosData || []).forEach((a: any) => {
        conteoPorGrupo.set(a.alumno_grupo_id, (conteoPorGrupo.get(a.alumno_grupo_id) || 0) + 1);
      });

      // 6. Qué combinaciones materia+grupo ya tienen lista en la fecha elegida
      const fechaStr = this.toDateStr(this.fechaSeleccionada);
      const { data: asistFecha } = await this.sesion.supabase
        .from('academic_asistencia')
        .select('grupo_id, asignatura_id')
        .in('grupo_id', todosGrupoIds)
        .in('asignatura_id', materiaIds)
        .eq('fecha', fechaStr);

      const combosConLista = new Set(
        (asistFecha || []).map((a: any) => `${a.asignatura_id}-${a.grupo_id}`)
      );

      // 7. Ensamblar la estructura final: materias con sus grupos
      this.materias = (materiasData || [])
        .map((m: any) => {
          const idsDeEstaMateria = grupoIdsPorMateria.get(m.id) || [];
          const grupos: GrupoDeMateria[] = idsDeEstaMateria
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
      // DIAGNÓSTICO TEMPORAL: mostramos el error real de Supabase para identificar
      // si es RLS, columna inexistente, o tabla inexistente. Quitar después.
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
    // El historial es específico de esta materia+grupo; se limpia para que
    // no se arrastre el de una selección anterior mientras carga el nuevo.
    this.historial = [];
    this.errorHistorial = null;
    this.cargarAlumnos();
  }

  // ── Cambiar la fecha seleccionada (protege cambios sin guardar) ──
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

  // Tocar un día del historial: brinca directo a "Tomar lista" en esa fecha
  abrirDiaHistorial(fechaISO: string) {
    this.cambiarFecha(this.parseISO(fechaISO), /* forzarSegmentoLista */ true);
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

    // this.hayComosGuardar refleja el estado de this.alumnos sin importar
    // qué pestaña (lista/historial) esté activa en este momento — así se
    // protege igual si el cambio de fecha viene desde el historial.
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

  // ── Pull-to-refresh ───────────────────────────────────────────
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

  // ── Volver (con protección de cambios sin guardar) ──────────
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
    // Ya estamos en el selector: salir de la página
    this.navCtrl.back();
  }

  private irASelector() {
    this.vista = 'selector';
    this.alumnos = [];
    this.historial = [];
    this.error = null;
    this.errorHistorial = null;
    this.cargarGrupos(); // refresca estados "tomada" para la fecha seleccionada
  }

  // ═══════════════════════════════════════════════════════════
  // TOMAR LISTA
  // ═══════════════════════════════════════════════════════════

  async cargarAlumnos() {
    this.cargando = true;
    this.error = null;
    try {
      const docenteId = this.sesion.usuario?.id;

      // Verificación de pertenencia: el maestro debe dar esta materia
      // Y estar asignado a este grupo (dos relaciones M:N distintas).
      const { data: relMateria, error: eRM } = await this.sesion.supabase
        .from('academic_asignatura_docentes')
        .select('id')
        .eq('asignatura_id', this.materiaId)
        .eq('user_id', docenteId)
        .maybeSingle();
      if (eRM) throw eRM;

      const { data: relGrupo, error: eRG } = await this.sesion.supabase
        .from('academic_grupo_docentes')
        .select('id')
        .eq('grupo_id', this.grupoId)
        .eq('user_id', docenteId)
        .maybeSingle();
      if (eRG) throw eRG;

      if (!relMateria || !relGrupo) {
        this.error = 'No tienes permiso para tomar asistencia en esta materia/grupo.';
        this.cargando = false;
        return;
      }

      // Alumnos del grupo (el roster de un grupo no depende de la materia)
      const { data: users, error: e1 } = await this.sesion.supabase
        .from('users_user')
        .select('id, first_name, last_name, foto_perfil')
        .eq('alumno_grupo_id', this.grupoId)
        .order('last_name');
      if (e1) throw e1;

      // Asistencia registrada para esta materia+grupo+fecha
      const fechaStr = this.toDateStr(this.fechaSeleccionada);
      const { data: asist } = await this.sesion.supabase
        .from('academic_asistencia')
        .select('alumno_id, estado')
        .eq('grupo_id', this.grupoId)
        .eq('asignatura_id', this.materiaId)
        .eq('fecha', fechaStr);

      const asistMap = new Map((asist || []).map((a: any) => [a.alumno_id, a.estado]));
      this.yaGuardada = asistMap.size > 0;

      this.alumnos = (users || []).map((u: any, i: number) => ({
        id:       u.id,
        numero:   i + 1,
        nombre:   u.first_name || '',
        apellido: u.last_name || '',
        foto:     u.foto_perfil,
        estado:   (asistMap.get(u.id) as Estado) ?? 'P', // default: Presente
        guardado: asistMap.has(u.id),
        // "revisado": si ya había un registro guardado antes, se considera
        // que ya fue revisado en su momento. Si es la primera vez que se
        // carga (sin registro), empieza sin revisar hasta que el maestro
        // toque explícitamente algún botón P/R/A.
        revisado: asistMap.has(u.id),
      }));

      this.filtroAlumno = '';

      // snapshot para detectar cambios sin guardar
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

  // ── Cambiar estado de un alumno ──────────────────────────────
  setEstado(alumno: Alumno, estado: Estado) {
    alumno.estado = estado;
    alumno.revisado = true;
  }

  // ── Acciones globales (con confirmación para evitar toques accidentales) ──
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

  // ── Guardar lista ────────────────────────────────────────────
  async guardarLista() {
    if (!this.alumnos.length || this.guardando) return;

    // 1) Si la fecha seleccionada NO es hoy, confirmar primero: es el error
    //    más fácil de cometer al permitir elegir fecha (guardar en el día
    //    equivocado sin darse cuenta).
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

  // 2) Aviso si ya existía una lista guardada en esa fecha (evita sobrescribir por error)
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

  // 3) Resumen final — siempre se muestra antes de guardar, con avisos
  //    adicionales si hay ausentismo alto o alumnos sin revisar.
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

    // NOTA: academic_asistencia NO tiene columna docente_id (confirmado en
    // Supabase) — solo id, fecha, alumno_id, grupo_id, asignatura_id, estado.
    // La identidad de un registro es alumno+grupo+materia+fecha.
    const registros = this.alumnos.map(a => ({
      alumno_id:     a.id,
      grupo_id:      this.grupoId,
      asignatura_id: this.materiaId,
      fecha:         fechaStr,
      estado:        a.estado,
    }));

    const { error } = await this.sesion.supabase
      .from('academic_asistencia')
      .upsert(registros, { onConflict: 'alumno_id,grupo_id,asignatura_id,fecha' });

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

    // El historial pudo haber quedado desactualizado con este guardado
    // (nueva fecha, o cambios sobre una fecha ya existente). Se limpia
    // para que, si el maestro entra a la pestaña Historial después, se
    // recargue con el dato fresco en vez de mostrar el cache viejo.
    this.historial = [];
  }

  // ── Historial (de esta materia+grupo) ─────────────────────────
  async onSegmentoChange() {
    if (this.segmento === 'historial' && !this.historial.length) {
      await this.cargarHistorial();
    }
  }

  async cargarHistorial() {
    this.cargandoHistorial = true;
    this.errorHistorial = null;

    // Traemos TODOS los registros de esta materia+grupo (sin límite de fecha),
    // para que se vea el historial completo desde que se empezó a tomar lista.
    const { data, error } = await this.sesion.supabase
      .from('academic_asistencia')
      .select('fecha, estado')
      .eq('grupo_id', this.grupoId)
      .eq('asignatura_id', this.materiaId)
      .order('fecha', { ascending: false });

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
      // Orden descendente explícito por fecha (más reciente primero).
      // No depende del orden en que Supabase devolvió las filas ni del
      // orden de inserción del Map: se garantiza aquí siempre.
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
