import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, MenuController } from '@ionic/angular';
import { SesionService, Usuario } from './services/sesion.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {

  // Año dinámico para el footer del menú (antes estaba fijo en "2025").
  currentYear = new Date().getFullYear();

  // Fallback real de avatar: antes el handler (error) estaba vacío y no
  // hacía nada si la imagen fallaba en tiempo real (URL rota, Cloudinary
  // caído, etc.). Ahora sí conmuta a un avatar local por defecto.
  private avatarFallback = 'assets/img/default-avatar.png';
  private avatarErrorOcurrido = false;

  // Badge "HOY" real: se calcula revisando si falta tomar asistencia hoy
  // en algún grupo+materia del docente. Antes estaba encendido siempre.
  hayAsistenciaPendienteHoy = false;

  // Badge "LIVE": no tenemos todavía ninguna tabla ni mecanismo real que
  // indique si hay una clase en vivo activa en este momento (no ha
  // aparecido ese módulo en el proyecto). Se deja apagado por default en
  // vez de mostrar "LIVE" fijo sin que signifique nada real. Conectar
  // aquí en cuanto exista esa función.
  hayClaseEnVivoActiva = false;

  constructor(
    private router: Router,
    private sesion: SesionService,
    private alertCtrl: AlertController,
    private menuCtrl: MenuController,
  ) {}

  ngOnInit() {
    // La sesion local ya se carga dentro del constructor de SesionService.
    if (this.esDocente) this.chequearAsistenciaPendienteHoy();
  }

  get usuario(): Usuario | null {
    return this.sesion.usuario;
  }

  get loggedIn(): boolean {
    return this.sesion.loggedIn;
  }

  get avatarUrl(): string {
    return this.avatarErrorOcurrido ? this.avatarFallback : this.sesion.getAvatarUrl();
  }

  // ── Helpers de rol para el menú dinámico ───────────────────────────
  // La app es solo para alumnos, docentes y tutores — se quitan COORD y
  // DIRECTOR, que antes hacían que esDocente() fuera true para esos
  // roles también.
  get esAlumno(): boolean {
    return this.sesion.rolActual === 'ALUMNO';
  }

  get esDocente(): boolean {
    return this.sesion.rolActual === 'DOCENTE';
  }

  get esTutor(): boolean {
    return this.sesion.rolActual === 'TUTOR';
  }

  getNombreDisplay(): string {
    return this.sesion.getNombreDisplay();
  }

  getEmailDisplay(): string {
    if (this.sesion.tutor) return this.sesion.tutor.parentesco;
    return this.sesion.usuario?.email || '';
  }

  onErrorImagen() {
    // Antes este método estaba vacío. Ahora sí activa el fallback local
    // para que no se quede el ícono de imagen rota si la URL falla.
    this.avatarErrorOcurrido = true;
  }

  async cerrarSesion() {
    // Antes cerraba sesión al instante con un solo toque, sin confirmar.
    const alert = await this.alertCtrl.create({
      header: 'Cerrar sesión',
      message: '¿Seguro que quieres cerrar tu sesión?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Cerrar sesión',
          role: 'destructive',
          handler: async () => {
            // El item de logout no usa ion-menu-toggle (para no cerrar el
            // menú antes de confirmar), así que se cierra manualmente aquí.
            await this.menuCtrl.close();
            this.sesion.cerrarSesion();
            this.router.navigate(['/login']);
          },
        },
      ],
    });
    await alert.present();
  }

  /** Se mantiene este metodo porque login.page.ts lo invoca tal cual. */
  async iniciarSesion(username: string, password: string): Promise<boolean> {
    return this.sesion.iniciarSesion(username, password);
  }

  // ══════════════════════════════════════════════════════════
  // Badge "HOY" — revisa si falta tomar asistencia en alguna
  // combinación materia+grupo del docente, para el día de hoy.
  // ══════════════════════════════════════════════════════════
  private async chequearAsistenciaPendienteHoy() {
    try {
      const uid = this.sesion.usuario?.id;
      if (!uid) return;

      const { data: relGrupos } = await this.sesion.supabase
        .from('academic_grupo_docentes').select('grupo_id').eq('user_id', uid);
      const grupoIds = [...new Set((relGrupos || []).map((r: any) => r.grupo_id))];
      if (!grupoIds.length) return;

      const { data: relMaterias } = await this.sesion.supabase
        .from('academic_asignatura_docentes').select('asignatura_id').eq('user_id', uid);
      const materiaIds = [...new Set((relMaterias || []).map((r: any) => r.asignatura_id))];
      if (!materiaIds.length) return;

      // Combinaciones materia+grupo que este docente realmente imparte
      // (simplificación: se asume que si el docente da la materia Y está
      // asignado al grupo, la combinación aplica — igual que el patrón
      // usado en asistencia.page).
      const { data: relAG } = await this.sesion.supabase
        .from('academic_asignatura_grupos')
        .select('asignatura_id, grupo_id')
        .in('asignatura_id', materiaIds)
        .in('grupo_id', grupoIds);

      const combos = new Set((relAG || []).map((r: any) => `${r.asignatura_id}-${r.grupo_id}`));
      if (combos.size === 0) return;

      const hoy = new Date().toISOString().split('T')[0];
      const { data: asistHoy } = await this.sesion.supabase
        .from('academic_asistencia')
        .select('grupo_id, asignatura_id')
        .in('grupo_id', grupoIds)
        .in('asignatura_id', materiaIds)
        .eq('fecha', hoy);

      const combosConLista = new Set((asistHoy || []).map((a: any) => `${a.asignatura_id}-${a.grupo_id}`));

      this.hayAsistenciaPendienteHoy = [...combos].some(c => !combosConLista.has(c));
    } catch {
      // Si algo falla, se deja el badge apagado en vez de mostrar
      // información que podría ser incorrecta.
      this.hayAsistenciaPendienteHoy = false;
    }
  }
}
